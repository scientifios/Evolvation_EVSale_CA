export const CONFIG = {
  countySalesUrl: "data/clean/county_sales_nested.json",
  zipSalesUrl: "data/clean/zip_sales_nested.json",
  timelineUrl: "data/clean/timeline.json",
  scatterUrl: "data/clean/county_charger_sales_scatter.json",
  storyMetricsUrl: "data/clean/story_metrics.json",
  usCountiesTopoUrl: "https://cdn.jsdelivr.net/npm/us-atlas@3/counties-10m.json",
  zctaGeoJsonUrl: "data/maps/ca_zcta.geojson",
  width: 1120,
  height: 690,
  scatterWidth: 1120,
  scatterHeight: 560,
  fuels: ["Electric", "Hydrogen", "PHEV"],
  colors: {
    Electric: "#f2c94c",
    Hydrogen: "#2f80ed",
    PHEV: "#27ae60"
  },
  countyZctaBaseUrl: "data/maps/county_zcta/"
};
