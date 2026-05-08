import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { initMap, setStatus } from "./map.js";
import { initScatterPlot } from "./scatter.js";
import { initStoryPanel } from "./story.js";

const d3 = globalThis.d3;
const topojson = globalThis.topojson;

function bindUi() {
  state.ui.svg = d3.select("#map");
  state.ui.tooltip = d3.select("#tooltip");
  state.ui.statusMessage = d3.select("#statusMessage");
  state.ui.timeSlider = d3.select("#timeSlider");
  state.ui.periodLabel = d3.select("#periodLabel");
  state.ui.backButton = d3.select("#backButton");
  state.ui.scatterSvg = d3.select("#scatterPlot");
  state.ui.scatterTooltip = d3.select("#scatterTooltip");
  state.ui.scatterCountyReadout = d3.select("#scatterCountyReadout");
  state.ui.scatterTimeSlider = d3.select("#scatterTimeSlider");
  state.ui.scatterPeriodLabel = d3.select("#scatterPeriodLabel");
  state.ui.scatterLogSwitch = d3.select("#scatterLogSwitch");
  state.ui.storyPeriod = d3.select("#storyPeriod");
  state.ui.storyTotal = d3.select("#storyTotal");
  state.ui.storyChange = d3.select("#storyChange");
  state.ui.storyLeader = d3.select("#storyLeader");
  state.ui.storyDominantFuel = d3.select("#storyDominantFuel");
  state.ui.storyNote = d3.select("#storyNote");
  state.ui.fuelShareElectric = d3.select("#fuelShareElectric");
  state.ui.fuelShareHydrogen = d3.select("#fuelShareHydrogen");
  state.ui.fuelSharePhev = d3.select("#fuelSharePhev");
  state.ui.stateTrend = d3.select("#stateTrend");
  state.ui.countyRanking = d3.select("#countyRanking");
  state.ui.rankingCaption = d3.select("#rankingCaption");
}

async function loadData() {
  setStatus("Loading data...");

  const [countyData, zipData, timelineData, scatterJson, storyMetrics, usTopo] = await Promise.all([
    d3.json(CONFIG.countySalesUrl),
    d3.json(CONFIG.zipSalesUrl),
    d3.json(CONFIG.timelineUrl),
    d3.json(CONFIG.scatterUrl),
    d3.json(CONFIG.storyMetricsUrl).catch(err => {
      console.warn("Story metrics not found yet:", err);
      return { timeline: [], statewide: [], byPeriod: {} };
    }),
    d3.json(CONFIG.usCountiesTopoUrl)
  ]);

  state.countySales = countyData || {};
  state.zipSales = zipData || {};
  state.timeline = timelineData || Object.keys(state.countySales).sort();
  state.scatterData = scatterJson || { timeline: [], counties: [], byPeriod: {} };
  state.storyMetrics = storyMetrics || { timeline: [], statewide: [], byPeriod: {} };
  state.countyFeatures = topojson.feature(usTopo, usTopo.objects.counties).features
    .filter(d => String(d.id).padStart(5, "0").startsWith("06"));

  try {
    await d3.json(CONFIG.zctaGeoJsonUrl);
  } catch (err) {
    console.warn("ZIP/ZCTA GeoJSON not found yet:", err);
  }
}

async function init() {
  bindUi();
  await loadData();
  initMap();
  initStoryPanel();
  initScatterPlot();
}

init().catch(err => {
  console.error(err);
  setStatus(`Could not load the project data. Check that data/clean/*.json exists and run through a local server. Error: ${err.message}`);
});
