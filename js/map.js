import { CONFIG } from "./config.js";
import { state } from "./state.js";
import { renderGlyphs } from "./glyphs.js";
import { updateStoryPeriod } from "./story.js";
import { areaTooltip, hideTooltip, showTooltip } from "./tooltips.js";
import { countySlug, getCountyName, getZip, loadCountyZcta, radiusScaleFor, salesForArea } from "./utils.js";

const d3 = globalThis.d3;

export function initMap() {
  const { ui } = state;

  ui.svg.attr("viewBox", `0 0 ${CONFIG.width} ${CONFIG.height}`);
  ui.root = ui.svg.append("g").attr("class", "root");
  ui.areaLayer = ui.root.append("g").attr("class", "areas");
  ui.glyphLayer = ui.root.append("g").attr("class", "glyphs");

  state.currentTransform = d3.zoomIdentity;
  state.zoom = d3.zoom()
    .scaleExtent([0.75, 12])
    .on("zoom", (event) => {
      state.currentTransform = event.transform;
      ui.root.attr("transform", state.currentTransform);
    });

  ui.svg.call(state.zoom);
  ui.backButton.on("click", () => renderStateView(true));

  ui.timeSlider.attr("max", Math.max(0, state.timeline.length - 1)).attr("value", state.periodIndex);
  ui.timeSlider.on("input", (event) => {
    state.periodIndex = Number(event.target.value);
    updateMapPeriod();
  });
  ui.timeSlider.on("wheel", (event) => {
    event.preventDefault();
    state.periodIndex = Math.max(0, Math.min(state.timeline.length - 1, state.periodIndex + (event.deltaY > 0 ? 1 : -1)));
    ui.timeSlider.property("value", state.periodIndex);
    updateMapPeriod();
  }, { passive: false });

  addZoomHint();
  renderStateView(false);
}

export function setStatus(message, visible = true) {
  state.ui.statusMessage.classed("hidden", !visible).text(message || "");
}

function resetZoom() {
  state.currentTransform = d3.zoomIdentity;
  state.ui.root.attr("transform", state.currentTransform);
  state.ui.svg.transition().duration(350).call(state.zoom.transform, d3.zoomIdentity);
}

function fitProjectionTo(features) {
  state.projection = d3.geoMercator().fitSize([CONFIG.width, CONFIG.height], { type: "FeatureCollection", features });
  state.path = d3.geoPath(state.projection);
}

export function renderStateView(animate) {
  const { ui } = state;

  ui.areaLayer.attr("clip-path", null);
  ui.glyphLayer.attr("clip-path", null);
  ui.svg.select("#countyClip").remove();
  state.currentView = "state";
  state.selectedCounty = null;
  state.selectedCountyFeature = null;
  ui.backButton.classed("hidden", true);
  setStatus("", false);
  fitProjectionTo(state.countyFeatures);
  ui.areaLayer.selectAll("*").remove();
  ui.glyphLayer.selectAll("*").remove();
  resetZoom();

  ui.areaLayer.selectAll("path")
    .data(state.countyFeatures, d => d.id)
    .join("path")
    .attr("class", "county")
    .attr("d", state.path)
    .on("mousemove", (event, d) => {
      const name = getCountyName(d);
      const record = salesForArea(state.countySales, state.timeline[state.periodIndex], name);
      showTooltip(ui.tooltip, ui.svg, event, areaTooltip(
        `${name} County`,
        state.timeline[state.periodIndex],
        record,
        "Click county block to view details inside the county."
      ));
    })
    .on("mouseout", () => hideTooltip(ui.tooltip))
    .on("click", (event, d) => renderCountyView(d));

  updateMapPeriod(animate);
}

async function renderCountyView(countyFeature) {
  const { ui } = state;

  state.currentView = "county";
  state.selectedCountyFeature = countyFeature;
  state.selectedCounty = getCountyName(countyFeature);
  ui.backButton.classed("hidden", false);

  ui.areaLayer.selectAll("*").remove();
  ui.glyphLayer.selectAll("*").remove();
  resetZoom();
  setStatus("", false);

  // Fit the map to the selected county before drawing ZIP/ZCTA geography.
  fitProjectionTo([countyFeature]);

  let defs = ui.svg.select("defs");
  if (defs.empty()) defs = ui.svg.append("defs");

  defs.select("#countyClip").remove();
  defs.append("clipPath")
    .attr("id", "countyClip")
    .append("path")
    .datum(countyFeature)
    .attr("d", state.path);

  ui.areaLayer.attr("clip-path", "url(#countyClip)");
  ui.glyphLayer.attr("clip-path", "url(#countyClip)");

  setStatus(`Loading ZIP boundaries for ${state.selectedCounty} County...`);

  let countyZips = [];
  try {
    countyZips = await loadCountyZcta(state.selectedCounty);
  } catch (err) {
    console.error(err);
    setStatus(`Cannot load data/maps/county_zcta/${countySlug(state.selectedCounty)}.geojson`);
    fitProjectionTo([countyFeature]);
    ui.areaLayer.append("path")
      .datum(countyFeature)
      .attr("class", "county")
      .attr("d", state.path);
    return;
  }

  countyZips = countyZips.filter(z => {
    const zip = getZip(z);
    return state.timeline.some(period => state.zipSales?.[period]?.[zip]);
  });

  console.log(state.selectedCounty, "candidate ZIP count:", countyZips.length, countyZips.map(getZip));

  if (!countyZips.length) {
    setStatus(`No ZIP sales data found around ${state.selectedCounty} County.`);
    ui.areaLayer.append("path")
      .datum(countyFeature)
      .attr("class", "county")
      .attr("d", state.path);
    return;
  }

  setStatus("", false);

  // Draw ZIP/ZCTA boundaries inside the selected county.
  ui.areaLayer.selectAll("path.zip-area")
    .data(countyZips, d => getZip(d))
    .join("path")
    .attr("class", "zip-area")
    .attr("d", state.path)
    .attr("fill", "#e6e6e6")
    .attr("stroke", "#999")
    .attr("stroke-width", 0.4)
    .on("mousemove", (event, d) => {
      const zip = getZip(d);
      const record = salesForArea(state.zipSales, state.timeline[state.periodIndex], zip);
      showTooltip(ui.tooltip, ui.svg, event, areaTooltip(`ZIP ${zip}`, state.timeline[state.periodIndex], record));
    })
    .on("mouseout", () => hideTooltip(ui.tooltip));

  // Keep the selected county outline visible above the clipped ZIP shapes.
  ui.areaLayer.append("path")
    .datum(countyFeature)
    .attr("class", "county-outline")
    .attr("d", state.path)
    .attr("fill", "none")
    .attr("stroke", "#555")
    .attr("stroke-width", 1.2)
    .attr("pointer-events", "none");

  updateMapPeriod(true);
}

export function updateMapPeriod(animate = true) {
  const { ui } = state;
  const period = state.timeline[state.periodIndex] || "";
  ui.periodLabel.text(period);
  updateStoryPeriod();

  if (state.currentView === "state") {
    renderGlyphs({
      features: state.countyFeatures,
      keyFn: getCountyName,
      nameFn: d => `${getCountyName(d)} County`,
      dataset: state.countySales,
      scale: radiusScaleFor(state.countySales),
      animate,
      period,
      path: state.path,
      glyphLayer: ui.glyphLayer,
      tooltip: ui.tooltip,
      svg: ui.svg
    });
    return;
  }

  if (!state.selectedCountyFeature) return;

  const zipMap = new Map();
  ui.areaLayer.selectAll("path.zip-area").data().forEach(feature => {
    const zip = getZip(feature);
    if (!zipMap.has(zip)) zipMap.set(zip, feature);
  });

  const uniqueZipFeatures = Array.from(zipMap.values());
  const keys = new Set(uniqueZipFeatures.map(getZip));

  renderGlyphs({
    features: uniqueZipFeatures,
    keyFn: getZip,
    nameFn: d => `ZIP ${getZip(d)}`,
    dataset: state.zipSales,
    scale: radiusScaleFor(state.zipSales, keys),
    animate,
    period,
    path: state.path,
    glyphLayer: ui.glyphLayer,
    tooltip: ui.tooltip,
    svg: ui.svg
  });
}

function addZoomHint() {
  state.ui.svg.append("g")
    .attr("class", "zoom-hint")
    .attr("transform", "translate(28, 36)")
    .append("text")
    .attr("x", 0)
    .attr("y", 0)
    .attr("font-size", "13px")
    .attr("fill", "#555")
    .attr("font-weight", "500")
    .text("Tip: Use mouse wheel to zoom in/out around the cursor; drag to pan; click a county block to view details inside the county.");
}
