from pathlib import Path
import re
import geopandas as gpd

PROJECT = Path(__file__).resolve().parents[1]

ZCTA_PATH = PROJECT / "data/maps/ca_zcta.geojson"
COUNTY_PATH = PROJECT / "data/maps/california_counties.geojson"
OUT_DIR = PROJECT / "data/maps/county_zcta"

OUT_DIR.mkdir(parents=True, exist_ok=True)

def slugify(name: str) -> str:
    name = name.lower().strip()
    name = re.sub(r"\s+county$", "", name)
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return name.strip("_")

zcta = gpd.read_file(ZCTA_PATH)
counties = gpd.read_file(COUNTY_PATH)

zcta = zcta.to_crs("EPSG:4326")
counties = counties.to_crs("EPSG:4326")

county_name_col = None
for col in ["NAME", "name", "County", "COUNTY"]:
    if col in counties.columns:
        county_name_col = col
        break

if county_name_col is None:
    raise ValueError(f"Cannot find county name column. Columns: {list(counties.columns)}")

for _, county in counties.iterrows():
    county_name = str(county[county_name_col])
    county_slug = slugify(county_name)

    county_gdf = gpd.GeoDataFrame([county], crs=counties.crs)

    # Use the bounding box as a fast pre-filter.
    minx, miny, maxx, maxy = county.geometry.bounds
    candidates = zcta.cx[minx:maxx, miny:maxy].copy()

    if candidates.empty:
        print(f"SKIP {county_name}: no bbox candidates")
        continue

    # Clip the candidates to the selected county boundary.
    clipped = gpd.overlay(candidates, county_gdf, how="intersection")

    clipped = clipped[~clipped.geometry.is_empty]

    # Find the ZIP/ZCTA identifier column.
    zip_col = None
    for col in ["ZCTA5CE20", "ZCTA5CE10", "GEOID20", "GEOID10", "GEOID"]:
        if col in clipped.columns:
            zip_col = col
            break

    if zip_col is None:
        raise ValueError(f"Cannot find ZIP/ZCTA column. Columns: {list(clipped.columns)}")

    # Merge split geometries so each ZIP becomes one feature.
    clipped = clipped.dissolve(by=zip_col, as_index=False)

    # Remove any empty geometries left by the overlay.
    clipped = clipped[~clipped.geometry.is_empty]

    out_path = OUT_DIR / f"{county_slug}.geojson"
    clipped.to_file(out_path, driver="GeoJSON")

    print(f"OK {county_name} -> {out_path.name}, {len(clipped)} features")
