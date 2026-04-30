import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { hideTooltip, scatterTooltipHtml, showTooltip } from "./tooltips.js";

const d3 = globalThis.d3;

function scatterColorScale() {
  const counties = state.scatterData.counties || [];
  const colors = counties.map((_, i) => d3.interpolateRainbow((i * 0.61803398875) % 1));
  return d3.scaleOrdinal().domain(counties).range(colors);
}

function scatterRegressionLine(points, xScale, yScale) {
  const n = points.length;
  if (n < 2) return null;

  const meanX = d3.mean(points, d => d.chargers);
  const meanY = d3.mean(points, d => d.zev_sales);
  const numerator = d3.sum(points, d => (d.chargers - meanX) * (d.zev_sales - meanY));
  const denominator = d3.sum(points, d => (d.chargers - meanX) ** 2);
  if (!denominator) return null;

  const slope = numerator / denominator;
  const intercept = meanY - slope * meanX;
  const [x0, x1] = xScale.domain();
  return [
    [xScale(x0), yScale(intercept + slope * x0)],
    [xScale(x1), yScale(intercept + slope * x1)]
  ];
}

function hideScatterTooltip() {
  hideTooltip(state.ui.scatterTooltip);
  state.ui.scatterCountyReadout.text("");
  state.ui.scatterSvg.selectAll(".scatter-point").classed("is-hovered", false);
}

export function initScatterPlot() {
  const { ui } = state;
  const periods = state.scatterData.timeline || [];

  ui.scatterSvg.attr("viewBox", `0 0 ${CONFIG.scatterWidth} ${CONFIG.scatterHeight}`);
  state.scatterPeriodIndex = 0;

  const allPoints = periods.flatMap(period => state.scatterData.byPeriod?.[period] || []);
  state.scatterDomains = {
    maxChargers: Math.max(1, d3.max(allPoints, d => Number(d.chargers || 0)) || 1),
    maxSales: Math.max(1, d3.max(allPoints, d => Number(d.zev_sales || 0)) || 1)
  };

  ui.scatterLogSwitch.on("change", (event) => {
    state.scatterUseLog = event.target.checked;
    renderScatterPlot(true);
  });

  ui.scatterTimeSlider
    .attr("max", Math.max(0, periods.length - 1))
    .attr("value", state.scatterPeriodIndex)
    .on("input", (event) => {
      state.scatterPeriodIndex = Number(event.target.value);
      renderScatterPlot(true);
    });

  d3.select(".scatter-control").on("wheel", (event) => {
    event.preventDefault();
    state.scatterPeriodIndex = Math.max(0, Math.min(periods.length - 1, state.scatterPeriodIndex + (event.deltaY > 0 ? 1 : -1)));
    ui.scatterTimeSlider.property("value", state.scatterPeriodIndex);
    renderScatterPlot(true);
  }, { passive: false });

  renderScatterPlot(false);
}

function renderScatterPlot(animate = true) {
  const { ui } = state;
  const periods = state.scatterData.timeline || [];
  const period = periods[state.scatterPeriodIndex] || "";
  const points = (state.scatterData.byPeriod?.[period] || []).map(d => ({
    county: d.county,
    chargers: Number(d.chargers || 0),
    zev_sales: Number(d.zev_sales || 0)
  }));

  ui.scatterPeriodLabel.text(period || "No data");
  ui.scatterCountyReadout.text("");

  const margin = { top: 28, right: 30, bottom: 78, left: 86 };
  const innerWidth = CONFIG.scatterWidth - margin.left - margin.right;
  const innerHeight = CONFIG.scatterHeight - margin.top - margin.bottom;
  const xValue = d => state.scatterUseLog ? Math.log10(d.chargers + 1) : d.chargers;
  const yValue = d => state.scatterUseLog ? Math.log10(d.zev_sales + 1) : d.zev_sales;
  const maxChargers = state.scatterUseLog ? Math.log10(state.scatterDomains.maxChargers + 1) : state.scatterDomains.maxChargers;
  const maxSales = state.scatterUseLog ? Math.log10(state.scatterDomains.maxSales + 1) : state.scatterDomains.maxSales;
  const axisFormat = state.scatterUseLog ? d3.format(".1f") : d3.format(",");
  const xScale = d3.scaleLinear().domain([0, maxChargers * 1.08]).nice().range([margin.left, margin.left + innerWidth]);
  const yScale = d3.scaleLinear().domain([0, maxSales * 1.08]).nice().range([margin.top + innerHeight, margin.top]);
  const color = scatterColorScale();

  let plot = ui.scatterSvg.select("g.scatter-root");
  if (plot.empty()) {
    plot = ui.scatterSvg.append("g").attr("class", "scatter-root");
    plot.append("g").attr("class", "scatter-axis x-axis");
    plot.append("g").attr("class", "scatter-axis y-axis");
    plot.append("text").attr("class", "scatter-axis-label x-label");
    plot.append("text").attr("class", "scatter-axis-label y-label");
    plot.append("path").attr("class", "trend-line");
    plot.append("g").attr("class", "scatter-points");
  }

  plot.select(".x-axis")
    .attr("transform", `translate(0,${margin.top + innerHeight})`)
    .transition().duration(animate ? 450 : 0)
    .call(d3.axisBottom(xScale).ticks(7).tickSizeOuter(0).tickFormat(axisFormat));

  plot.select(".y-axis")
    .attr("transform", `translate(${margin.left},0)`)
    .transition().duration(animate ? 450 : 0)
    .call(d3.axisLeft(yScale).ticks(7).tickSizeOuter(0).tickFormat(axisFormat));

  plot.select(".x-label")
    .attr("x", margin.left + innerWidth / 2)
    .attr("y", CONFIG.scatterHeight - 30)
    .attr("text-anchor", "middle")
    .text(state.scatterUseLog ? "log10(ZEV charger count + 1)" : "ZEV charger count");

  plot.select(".y-label")
    .attr("transform", `translate(24,${margin.top + innerHeight / 2}) rotate(-90)`)
    .attr("text-anchor", "middle")
    .text(state.scatterUseLog ? "log10(EV sales + 1)" : "EV sales");

  const regressionPoints = points.map(d => ({
    chargers: xValue(d),
    zev_sales: yValue(d)
  }));
  const regression = scatterRegressionLine(regressionPoints, xScale, yScale);
  plot.select(".trend-line")
    .datum(regression || [])
    .transition().duration(animate ? 450 : 0)
    .attr("d", regression ? d3.line()(regression) : null);

  const pointSelection = plot.select(".scatter-points")
    .selectAll("circle")
    .data(points, d => d.county);

  pointSelection.exit()
    .transition().duration(250)
    .attr("r", 0)
    .style("opacity", 0)
    .remove();

  const entered = pointSelection.enter()
    .append("circle")
    .attr("class", "scatter-point")
    .attr("cx", d => xScale(xValue(d)))
    .attr("cy", d => yScale(yValue(d)))
    .attr("r", 0)
    .attr("fill", d => color(d.county))
    .style("opacity", 0.88);

  entered.merge(pointSelection)
    .on("mousemove", function(event, d) {
      ui.scatterSvg.selectAll(".scatter-point").classed("is-hovered", false);
      d3.select(this).classed("is-hovered", true).raise();
      ui.scatterCountyReadout.text(`${d.county} County`);
      showTooltip(ui.scatterTooltip, ui.scatterSvg, event, scatterTooltipHtml(d, period));
    })
    .on("mouseout", hideScatterTooltip)
    .transition().duration(animate ? 650 : 0).ease(d3.easeCubicOut)
    .attr("cx", d => xScale(xValue(d)))
    .attr("cy", d => yScale(yValue(d)))
    .attr("r", 6.2)
    .attr("fill", d => color(d.county))
    .style("opacity", 0.88);
}
