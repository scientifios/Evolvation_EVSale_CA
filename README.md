# California EV Sales Explorer

Interactive D3 visualization for CSEN 377 Assignment 2.

## 1. Put cleaned data here

Your cleaning script should generate these files:

```text
data/clean/county_sales_nested.json
data/clean/zip_sales_nested.json
data/clean/timeline.json
data/clean/county_charger_sales_scatter.json
```

If you have not generated them yet, copy the original Excel file into this folder and run:

```bash
python scripts/clean_zev_data.py --input "New_ZEV_Sales_Last_updated_01-15-2026_ada(3).xlsx" --output-dir data/clean
```

For the charger-sales scatter plot, include the charger workbook:

```bash
python scripts/clean_zev_data.py --input "New_ZEV_Sales_Last_updated_01-15-2026_ada.xlsx" --charger-input "EV_Chargers_Last_updated_09-08-2025_ada.xlsx" --output-dir data/clean
```

## 2. Add ZIP/ZCTA boundary file

County view works automatically using `us-atlas` from CDN.

For ZIP drill-down, put a California ZIP/ZCTA GeoJSON here:

```text
data/maps/ca_zcta.geojson
```

The JavaScript recognizes common ZIP property names such as:

```text
ZCTA5CE20, ZCTA5CE10, GEOID20, GEOID10, GEOID, ZIP, zip
```

If this file is missing, the statewide county map still works, but clicking a county will show a warning.

## 3. Run locally in VS Code

Open the project folder in VS Code, then run one of these commands in the terminal:

```bash
python -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Do not open `index.html` directly by double-clicking, because browsers often block local JSON loading.

## 4. Files

```text
index.html      Main web page
style.css       Visual style
js/app.js       Browser module entry point and data loading
js/config.js    Shared configuration
js/state.js     Shared runtime state
js/map.js       County map, ZIP drill-down, timeline, zoom
js/glyphs.js    Three-circle sales glyph rendering
js/scatter.js   Charger and EV sales scatter plot
js/tooltips.js  Tooltip HTML and positioning
js/utils.js     Shared formatting, lookup, and scale helpers
scripts/        Data cleaning script backup
data/clean/     Cleaned sales JSON files
data/maps/      ZIP/ZCTA GeoJSON boundary file
```

## 5. Interaction checklist

- County-level California map
- Light gray administrative boundaries
- Hover county: county name + Electric / Hydrogen / PHEV sales
- Three-circle glyph per county
- Hover circle: fuel-type sales number
- Timeline from 2008 Q3 to 2025 Q4
- Smooth circle growth/shrink animation
- Mouse-wheel timeline control
- Zoom in/out/reset controls
- Click county to enter ZIP-level view when `ca_zcta.geojson` exists
- Back button to return to California view
- County-level charger-sales scatter plot from 2020 Q2 onward
- Scatter timeline includes only quarters present in the charger workbook
- Hover scatter point: county name, EV sales, and ZEV charger count
