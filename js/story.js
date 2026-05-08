import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { formatNumber } from "./utils.js";

const d3 = globalThis.d3;

const STORY_WIDTH = 720;
const STORY_HEIGHT = 300;
const FUEL_LABELS = {
  Electric: "Electric",
  Hydrogen: "Hydrogen",
  PHEV: "PHEV"
};

function formatPct(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "new";
  return d3.format("+.1%")(Number(value));
}

function formatDelta(value) {
  const sign = Number(value || 0) > 0 ? "+" : "";
  return `${sign}${formatNumber(value)}`;
}

function dominantFuel(record) {
  return CONFIG.fuels
    .map(fuel => ({ fuel, value: Number(record?.[fuel] || 0) }))
    .sort((a, b) => b.value - a.value)[0] || { fuel: "-", value: 0 };
}

function metricForPeriod(period) {
  return state.storyMetrics?.byPeriod?.[period] || null;
}

function drawTrendChart() {
  const svg = state.ui.stateTrend;
  const data = state.storyMetrics?.statewide || [];
  if (!data.length || svg.empty()) return;

  svg.attr("viewBox", `0 0 ${STORY_WIDTH} ${STORY_HEIGHT}`);
  svg.selectAll("*").remove();

  const margin = { top: 22, right: 18, bottom: 42, left: 64 };
  const innerWidth = STORY_WIDTH - margin.left - margin.right;
  const innerHeight = STORY_HEIGHT - margin.top - margin.bottom;
  const x = d3.scalePoint()
    .domain(data.map(d => d.period))
    .range([margin.left, margin.left + innerWidth])
    .padding(0.5);
  const y = d3.scaleLinear()
    .domain([0, d3.max(data, d => d.total) || 1])
    .nice()
    .range([margin.top + innerHeight, margin.top]);
  const stack = d3.stack().keys(CONFIG.fuels)(data);
  const area = d3.area()
    .x(d => x(d.data.period))
    .y0(d => y(d[0]))
    .y1(d => y(d[1]))
    .curve(d3.curveMonotoneX);

  const root = svg.append("g").attr("class", "trend-root");
  root.append("g")
    .attr("class", "trend-grid")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickSize(-innerWidth).tickFormat(""))
    .call(g => g.select(".domain").remove());

  root.selectAll("path.trend-area")
    .data(stack, d => d.key)
    .join("path")
    .attr("class", "trend-area")
    .attr("fill", d => CONFIG.colors[d.key])
    .attr("d", area);

  root.append("g")
    .attr("class", "trend-axis")
    .attr("transform", `translate(0,${margin.top + innerHeight})`)
    .call(d3.axisBottom(x).tickValues(data.filter((_, i) => i % 8 === 0).map(d => d.period)).tickSizeOuter(0));

  root.append("g")
    .attr("class", "trend-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .call(d3.axisLeft(y).ticks(4).tickFormat(d3.format("~s")).tickSizeOuter(0));

  root.append("text")
    .attr("class", "trend-title")
    .attr("x", margin.left)
    .attr("y", 18)
    .text("Statewide sales by fuel type");

  root.append("line")
    .attr("class", "trend-marker")
    .attr("y1", margin.top)
    .attr("y2", margin.top + innerHeight);
}

function updateTrendMarker(period) {
  const data = state.storyMetrics?.statewide || [];
  if (!data.length || state.ui.stateTrend.empty()) return;
  const x = d3.scalePoint()
    .domain(data.map(d => d.period))
    .range([64, STORY_WIDTH - 18])
    .padding(0.5);
  state.ui.stateTrend.select(".trend-marker")
    .transition().duration(250)
    .attr("x1", x(period))
    .attr("x2", x(period));
}

function renderRanking(metric) {
  const rows = metric?.topCounties || [];
  const rankedRows = rows.slice(0, 6).map((d, i) => ({ ...d, rank: i + 1 }));
  const max = d3.max(rows, d => d.total) || 1;
  const previousPositions = new Map();

  state.ui.countyRanking.selectAll(".ranking-row").each(function(d) {
    previousPositions.set(d.county, this.getBoundingClientRect().top);
  });

  const selection = state.ui.countyRanking.selectAll(".ranking-row")
    .data(rankedRows, d => d.county);

  selection.exit()
    .transition().duration(240)
    .style("opacity", 0)
    .style("transform", "translateY(10px)")
    .remove();

  const enter = selection.enter()
    .append("div")
    .attr("class", "ranking-row")
    .style("opacity", 0)
    .style("transform", "translateY(12px)");
  enter.append("span").attr("class", "ranking-name");
  enter.append("div").attr("class", "ranking-bar").append("i");
  enter.append("span").attr("class", "ranking-value");

  const merged = enter.merge(selection);
  merged.select(".ranking-name").text(d => d.county);
  merged.select(".ranking-value").text(d => formatNumber(d.total));
  merged.select(".ranking-bar i")
    .transition().duration(520).ease(d3.easeCubicOut)
    .style("width", d => `${Math.max(2, (d.total / max) * 100)}%`);

  merged.sort((a, b) => a.rank - b.rank).order();

  merged.each(function(d) {
    const row = d3.select(this);
    const oldTop = previousPositions.get(d.county);
    const newTop = this.getBoundingClientRect().top;
    const offset = oldTop === undefined ? 12 : oldTop - newTop;

    row.interrupt()
      .style("transform", `translateY(${offset}px)`)
      .style("opacity", oldTop === undefined ? 0 : 1)
      .transition().duration(560).ease(d3.easeCubicOut)
      .style("transform", "translateY(0px)")
      .style("opacity", 1);
  });
}

export function initStoryPanel() {
  drawTrendChart();
  updateStoryPeriod();
}

export function updateStoryPeriod() {
  const period = state.timeline[state.periodIndex];
  const metric = metricForPeriod(period);
  if (!metric || !state.ui.storyPeriod) return;

  const leader = metric.topCounties?.[0];
  const fuel = dominantFuel(metric);
  const share = metric.fuelShare || {};
  const changeText = `${formatDelta(metric.qoqDelta)} (${formatPct(metric.qoqPct)})`;

  state.ui.storyPeriod.text(period);
  state.ui.storyTotal.text(formatNumber(metric.total));
  state.ui.storyChange.text(changeText);
  state.ui.storyLeader.text(leader ? leader.county : "-");
  state.ui.storyDominantFuel.text(FUEL_LABELS[fuel.fuel] || fuel.fuel);
  state.ui.rankingCaption.text(`Top counties by sales in ${period}`);
  state.ui.storyNote.text(`${leader?.county || "The leading county"} accounts for ${formatPct(leader ? leader.total / metric.total : 0)} of statewide sales this quarter.`);

  state.ui.fuelShareElectric.style("width", `${(share.Electric || 0) * 100}%`);
  state.ui.fuelShareHydrogen.style("width", `${(share.Hydrogen || 0) * 100}%`);
  state.ui.fuelSharePhev.style("width", `${(share.PHEV || 0) * 100}%`);

  renderRanking(metric);
  updateTrendMarker(period);
}
