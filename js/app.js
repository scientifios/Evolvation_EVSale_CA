import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { initMap, setStatus } from "./map.js";
import { initScatterPlot } from "./scatter.js";

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
}

async function loadData() {
  setStatus("Loading data...");

  const [countyData, zipData, timelineData, scatterJson, usTopo] = await Promise.all([
    d3.json(CONFIG.countySalesUrl),
    d3.json(CONFIG.zipSalesUrl),
    d3.json(CONFIG.timelineUrl),
    d3.json(CONFIG.scatterUrl),
    d3.json(CONFIG.usCountiesTopoUrl)
  ]);

  state.countySales = countyData || {};
  state.zipSales = zipData || {};
  state.timeline = timelineData || Object.keys(state.countySales).sort();
  state.scatterData = scatterJson || { timeline: [], counties: [], byPeriod: {} };
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
  initScatterPlot();
}

init().catch(err => {
  console.error(err);
  setStatus(`Could not load the project data. Check that data/clean/*.json exists and run through a local server. Error: ${err.message}`);
});
