import { CONFIG } from "./config.js";
import { state } from "./state.js";

const d3 = globalThis.d3;

export function normalizeName(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

export function getCountyName(feature) {
  const p = feature.properties || {};
  return normalizeName(p.name || p.NAME || p.county || p.COUNTY);
}

export function countySlug(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\s+county$/i, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

export async function loadCountyZcta(countyName) {
  const slug = countySlug(countyName);

  if (state.countyZctaCache.has(slug)) {
    return state.countyZctaCache.get(slug);
  }

  const geojson = await d3.json(`${CONFIG.countyZctaBaseUrl}${slug}.geojson`);
  const features = geojson.features || [];
  state.countyZctaCache.set(slug, features);
  return features;
}

export function getZip(feature) {
  const p = feature.properties || {};
  return String(p.ZCTA5CE20 || p.ZCTA5CE10 || p.GEOID20 || p.GEOID10 || p.GEOID || p.ZIP || p.zip || "").padStart(5, "0");
}

export function salesForArea(dataset, period, key) {
  return dataset?.[period]?.[key] || { Electric: 0, Hydrogen: 0, PHEV: 0, total: 0 };
}

export function maxSales(dataset, keys = null) {
  let maxValue = 1;
  for (const period of Object.keys(dataset || {})) {
    for (const [key, record] of Object.entries(dataset[period])) {
      if (keys && !keys.has(String(key))) continue;
      for (const fuel of CONFIG.fuels) {
        maxValue = Math.max(maxValue, Number(record[fuel] || 0));
      }
    }
  }
  return maxValue;
}

export function radiusScaleFor(dataset, keys = null) {
  return d3.scaleSqrt().domain([0, maxSales(dataset, keys)]).range([0, 28]);
}

export function formatNumber(value) {
  return d3.format(",")(Number(value || 0));
}
