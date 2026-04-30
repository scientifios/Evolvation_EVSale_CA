import argparse
import json
import re
from pathlib import Path

import pandas as pd

FUEL_MAP = {
    "electric": "Electric",
    "battery electric": "Electric",
    "bev": "Electric",
    "hydrogen": "Hydrogen",
    "fuel cell": "Hydrogen",
    "fcev": "Hydrogen",
    "phev": "PHEV",
    "plug-in hybrid": "PHEV",
    "plug in hybrid": "PHEV",
    "plug-in hybrid electric": "PHEV",
    "plug in hybrid electric": "PHEV",
}

FUEL_ORDER = ["Electric", "Hydrogen", "PHEV"]

CA_COUNTIES = {
    "Alameda", "Alpine", "Amador", "Butte", "Calaveras", "Colusa",
    "Contra Costa", "Del Norte", "El Dorado", "Fresno", "Glenn",
    "Humboldt", "Imperial", "Inyo", "Kern", "Kings", "Lake", "Lassen",
    "Los Angeles", "Madera", "Marin", "Mariposa", "Mendocino", "Merced",
    "Modoc", "Mono", "Monterey", "Napa", "Nevada", "Orange", "Placer",
    "Plumas", "Riverside", "Sacramento", "San Benito", "San Bernardino",
    "San Diego", "San Francisco", "San Joaquin", "San Luis Obispo",
    "San Mateo", "Santa Barbara", "Santa Clara", "Santa Cruz", "Shasta",
    "Sierra", "Siskiyou", "Solano", "Sonoma", "Stanislaus", "Sutter",
    "Tehama", "Trinity", "Tulare", "Tuolumne", "Ventura", "Yolo", "Yuba",
}

MONTH_TO_QUARTER = {
    "jan": 1, "january": 1,
    "feb": 1, "february": 1,
    "mar": 1, "march": 1,
    "apr": 2, "april": 2,
    "may": 2,
    "jun": 2, "june": 2,
    "jul": 3, "july": 3,
    "aug": 3, "august": 3,
    "sep": 3, "sept": 3, "september": 3,
    "oct": 4, "october": 4,
    "nov": 4, "november": 4,
    "dec": 4, "december": 4,
}


def normalize_col_name(name: str) -> str:
    name = str(name).strip().lower()
    name = re.sub(r"[^a-z0-9]+", "_", name)
    return name.strip("_")


def find_col(df: pd.DataFrame, candidates: list[str]) -> str:
    normalized = {normalize_col_name(c): c for c in df.columns}
    for candidate in candidates:
        key = normalize_col_name(candidate)
        if key in normalized:
            return normalized[key]
    raise ValueError(f"Cannot find any of these columns: {candidates}. Existing columns: {list(df.columns)}")


def normalize_fuel_type(value) -> str | None:
    if pd.isna(value):
        return None
    raw = str(value).strip()
    key = raw.lower()
    key = re.sub(r"\s+", " ", key)
    if key in FUEL_MAP:
        return FUEL_MAP[key]
    for pattern, normalized in FUEL_MAP.items():
        if pattern in key:
            return normalized
    return raw


def normalize_quarter(value) -> int:
    if pd.isna(value):
        raise ValueError("Quarter contains missing values.")
    text = str(value).strip().upper()
    match = re.search(r"[1-4]", text)
    if not match:
        raise ValueError(f"Cannot parse quarter value: {value}")
    return int(match.group(0))


def normalize_year(value) -> int:
    if pd.isna(value):
        raise ValueError("Data_Year contains missing values.")
    return int(float(value))


def clean_place_name(value) -> str:
    if pd.isna(value):
        return "Unknown"
    text = str(value).strip()
    text = re.sub(r"\s+", " ", text)
    return text.title()


def clean_zip(value) -> str | None:
    if pd.isna(value):
        return None
    text = str(value).strip()
    if text.endswith(".0"):
        text = text[:-2]
    digits = re.sub(r"\D", "", text)
    if len(digits) < 5:
        return None
    return digits[:5]


def period_sort_key(period: str) -> tuple[int, int]:
    year, q = period.split("-Q")
    return int(year), int(q)


def parse_charger_sheet_period(sheet_name: str) -> tuple[str, int, int] | None:
    text = str(sheet_name).strip()
    year_match = re.search(r"(20\d{2})", text)
    if not year_match:
        return None
    year = int(year_match.group(1))

    quarter_match = re.search(r"\bQ([1-4])\b", text, flags=re.IGNORECASE)
    if quarter_match:
        quarter = int(quarter_match.group(1))
    else:
        month_match = re.search(r"\b([A-Za-z]+)\b", text)
        if not month_match:
            return None
        quarter = MONTH_TO_QUARTER.get(month_match.group(1).lower())
        if not quarter:
            return None

    return f"{year}-Q{quarter}", year, quarter


def make_timeline(start="2008-Q3", end="2025-Q4") -> list[str]:
    sy, sq = period_sort_key(start)
    ey, eq = period_sort_key(end)
    result = []
    for y in range(sy, ey + 1):
        for q in range(1, 5):
            if (y, q) < (sy, sq) or (y, q) > (ey, eq):
                continue
            result.append(f"{y}-Q{q}")
    return result


def read_sheet(path: Path, sheet_name: str) -> pd.DataFrame:
    return pd.read_excel(path, sheet_name=sheet_name, engine="openpyxl")


def prepare_common_columns(df: pd.DataFrame) -> pd.DataFrame:
    year_col = find_col(df, ["Data_Year", "Data Year", "Year"])
    quarter_col = find_col(df, ["Quarter", "Qtr"])
    fuel_col = find_col(df, ["FUEL_TYPE", "Fuel Type", "Fuel"])
    value_col = find_col(df, ["Number of Vehicles", "Vehicles", "Sales", "Count"])

    out = df.copy()
    out["year"] = out[year_col].apply(normalize_year)
    out["quarter"] = out[quarter_col].apply(normalize_quarter)
    out["period"] = out["year"].astype(str) + "-Q" + out["quarter"].astype(str)
    out["fuel_type"] = out[fuel_col].apply(normalize_fuel_type)
    out["sales"] = pd.to_numeric(out[value_col], errors="coerce").fillna(0).astype(int)
    out = out[out["fuel_type"].isin(FUEL_ORDER)]
    out = out[(out["period"] >= "2008-Q3") & (out["period"] <= "2025-Q4")]
    return out


def aggregate_county(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame]:
    county_col = find_col(df, ["County", "County Name"])
    out = prepare_common_columns(df)
    out["county"] = out[county_col].apply(clean_place_name)

    long_df = (
        out.groupby(["period", "year", "quarter", "county", "fuel_type"], as_index=False)["sales"]
        .sum()
        .sort_values(["year", "quarter", "county", "fuel_type"])
    )

    wide_df = (
        long_df.pivot_table(
            index=["period", "year", "quarter", "county"],
            columns="fuel_type",
            values="sales",
            aggfunc="sum",
            fill_value=0,
        )
        .reset_index()
    )
    for fuel in FUEL_ORDER:
        if fuel not in wide_df.columns:
            wide_df[fuel] = 0
    wide_df["total"] = wide_df[FUEL_ORDER].sum(axis=1)
    return long_df, wide_df[["period", "year", "quarter", "county", *FUEL_ORDER, "total"]]


def aggregate_zip(df: pd.DataFrame, zip_city_crosswalk: Path | None = None) -> tuple[pd.DataFrame, pd.DataFrame]:
    zip_col = find_col(df, ["ZIP", "Zip", "Zip Code", "ZIP Code"])
    out = prepare_common_columns(df)
    out["zip"] = out[zip_col].apply(clean_zip)
    out = out[out["zip"].notna()]

    if zip_city_crosswalk:
        crosswalk = pd.read_csv(zip_city_crosswalk, dtype=str)
        zip_key = find_col(crosswalk, ["ZIP", "Zip", "Zip Code", "zip"])
        city_key = find_col(crosswalk, ["City", "Place", "Place Name", "city"])
        county_candidates = ["County", "County Name", "county"]
        county_key = None
        for c in county_candidates:
            try:
                county_key = find_col(crosswalk, [c])
                break
            except ValueError:
                pass
        keep_cols = [zip_key, city_key] + ([county_key] if county_key else [])
        crosswalk = crosswalk[keep_cols].drop_duplicates()
        crosswalk["zip"] = crosswalk[zip_key].apply(clean_zip)
        crosswalk["city"] = crosswalk[city_key].apply(clean_place_name)
        if county_key:
            crosswalk["county"] = crosswalk[county_key].apply(clean_place_name)
            crosswalk = crosswalk[["zip", "city", "county"]]
        else:
            crosswalk = crosswalk[["zip", "city"]]
        out = out.merge(crosswalk, on="zip", how="left")
    else:
        out["city"] = ""
        out["county"] = ""

    long_df = (
        out.groupby(["period", "year", "quarter", "zip", "city", "county", "fuel_type"], as_index=False, dropna=False)["sales"]
        .sum()
        .sort_values(["year", "quarter", "zip", "fuel_type"])
    )

    wide_df = (
        long_df.pivot_table(
            index=["period", "year", "quarter", "zip", "city", "county"],
            columns="fuel_type",
            values="sales",
            aggfunc="sum",
            fill_value=0,
        )
        .reset_index()
    )
    for fuel in FUEL_ORDER:
        if fuel not in wide_df.columns:
            wide_df[fuel] = 0
    wide_df["total"] = wide_df[FUEL_ORDER].sum(axis=1)
    return long_df, wide_df[["period", "year", "quarter", "zip", "city", "county", *FUEL_ORDER, "total"]]


def nested_json_from_wide(df: pd.DataFrame, key_col: str) -> dict:
    result = {}
    for _, row in df.iterrows():
        period = row["period"]
        area_key = str(row[key_col])
        if period not in result:
            result[period] = {}
        result[period][area_key] = {
            "Electric": int(row["Electric"]),
            "Hydrogen": int(row["Hydrogen"]),
            "PHEV": int(row["PHEV"]),
            "total": int(row["total"]),
        }
        if "city" in df.columns and pd.notna(row.get("city", None)):
            result[period][area_key]["city"] = str(row.get("city", ""))
        if "county" in df.columns and pd.notna(row.get("county", None)):
            result[period][area_key]["county"] = str(row.get("county", ""))
    return result


def aggregate_chargers(charger_path: Path) -> pd.DataFrame:
    xl = pd.ExcelFile(charger_path, engine="openpyxl")
    frames = []

    for sheet_name in xl.sheet_names:
        parsed_period = parse_charger_sheet_period(sheet_name)
        if parsed_period is None:
            continue
        period, year, quarter = parsed_period
        if period_sort_key(period) < period_sort_key("2020-Q2"):
            continue

        raw = pd.read_excel(charger_path, sheet_name=sheet_name, engine="openpyxl")
        county_col = find_col(raw, ["County", "County Name"])
        total_col = find_col(raw, ["Total", "Total Chargers", "Chargers"])

        frame = raw[[county_col, total_col]].copy()
        frame["period"] = period
        frame["year"] = year
        frame["quarter"] = quarter
        frame["county"] = frame[county_col].apply(clean_place_name)
        frame["chargers"] = pd.to_numeric(frame[total_col], errors="coerce").fillna(0).astype(int)
        frame = frame[frame["county"].isin(CA_COUNTIES)]
        frames.append(frame[["period", "year", "quarter", "county", "chargers"]])

    if not frames:
        return pd.DataFrame(columns=["period", "year", "quarter", "county", "chargers"])

    return (
        pd.concat(frames, ignore_index=True)
        .groupby(["period", "year", "quarter", "county"], as_index=False)["chargers"]
        .sum()
        .sort_values(["year", "quarter", "county"])
    )


def build_charger_sales_scatter(county_sales_wide: pd.DataFrame, charger_path: Path) -> pd.DataFrame:
    chargers = aggregate_chargers(charger_path)
    sales = county_sales_wide[["period", "year", "quarter", "county", "total"]].rename(columns={"total": "zev_sales"})
    merged = chargers.merge(sales, on=["period", "year", "quarter", "county"], how="left")
    merged["zev_sales"] = merged["zev_sales"].fillna(0).astype(int)
    return merged[["period", "year", "quarter", "county", "chargers", "zev_sales"]].sort_values(
        ["year", "quarter", "county"]
    )


def scatter_json_from_df(df: pd.DataFrame) -> dict:
    timeline = sorted(df["period"].unique(), key=period_sort_key)
    counties = sorted(df["county"].unique())
    by_period = {}

    for period, period_df in df.groupby("period", sort=False):
        by_period[period] = [
            {
                "county": row["county"],
                "chargers": int(row["chargers"]),
                "zev_sales": int(row["zev_sales"]),
            }
            for _, row in period_df.sort_values("county").iterrows()
        ]

    return {
        "timeline": timeline,
        "counties": counties,
        "byPeriod": by_period,
        "xLabel": "ZEV chargers",
        "yLabel": "EV sales",
    }


def main():
    parser = argparse.ArgumentParser(description="Clean California ZEV sales data for an interactive D3 visualization.")
    parser.add_argument("--input", required=True, help="Path to the original Excel file.")
    parser.add_argument("--output-dir", default="data/clean", help="Folder for cleaned CSV and JSON outputs.")
    parser.add_argument("--county-sheet", default="County", help="County sheet name in Excel.")
    parser.add_argument("--zip-sheet", default="ZIP", help="ZIP sheet name in Excel.")
    parser.add_argument("--zip-city-crosswalk", default=None, help="Optional CSV with ZIP, City, and optionally County columns.")
    parser.add_argument(
        "--charger-input",
        default=None,
        help="Optional path to EV charger Excel file. If omitted, the default project charger file is used when present.",
    )
    args = parser.parse_args()

    input_path = Path(args.input)
    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    county_raw = read_sheet(input_path, args.county_sheet)
    zip_raw = read_sheet(input_path, args.zip_sheet)

    county_long, county_wide = aggregate_county(county_raw)
    zip_long, zip_wide = aggregate_zip(zip_raw, Path(args.zip_city_crosswalk) if args.zip_city_crosswalk else None)

    county_long.to_csv(output_dir / "county_sales_long.csv", index=False)
    county_wide.to_csv(output_dir / "county_sales_wide.csv", index=False)
    zip_long.to_csv(output_dir / "zip_sales_long.csv", index=False)
    zip_wide.to_csv(output_dir / "zip_sales_wide.csv", index=False)

    with open(output_dir / "county_sales_nested.json", "w", encoding="utf-8") as f:
        json.dump(nested_json_from_wide(county_wide, "county"), f, ensure_ascii=False)

    with open(output_dir / "zip_sales_nested.json", "w", encoding="utf-8") as f:
        json.dump(nested_json_from_wide(zip_wide, "zip"), f, ensure_ascii=False)

    timeline = make_timeline("2008-Q3", "2025-Q4")
    with open(output_dir / "timeline.json", "w", encoding="utf-8") as f:
        json.dump(timeline, f, ensure_ascii=False, indent=2)

    summary = {
        "county_rows_long": int(len(county_long)),
        "county_rows_wide": int(len(county_wide)),
        "zip_rows_long": int(len(zip_long)),
        "zip_rows_wide": int(len(zip_wide)),
        "period_start": timeline[0],
        "period_end": timeline[-1],
        "fuel_types": FUEL_ORDER,
        "outputs": [
            "county_sales_long.csv",
            "county_sales_wide.csv",
            "county_sales_nested.json",
            "zip_sales_long.csv",
            "zip_sales_wide.csv",
            "zip_sales_nested.json",
            "timeline.json",
        ],
    }

    default_charger_path = Path("EV_Chargers_Last_updated_09-08-2025_ada.xlsx")
    charger_path = Path(args.charger_input) if args.charger_input else default_charger_path
    if charger_path.exists():
        scatter = build_charger_sales_scatter(county_wide, charger_path)
        scatter.to_csv(output_dir / "county_charger_sales_scatter.csv", index=False)
        with open(output_dir / "county_charger_sales_scatter.json", "w", encoding="utf-8") as f:
            json.dump(scatter_json_from_df(scatter), f, ensure_ascii=False, indent=2)
        summary["scatter_rows"] = int(len(scatter))
        summary["scatter_period_start"] = str(scatter["period"].iloc[0]) if len(scatter) else None
        summary["scatter_period_end"] = str(scatter["period"].iloc[-1]) if len(scatter) else None
        summary["scatter_periods"] = sorted(scatter["period"].unique(), key=period_sort_key)
        summary["outputs"].extend([
            "county_charger_sales_scatter.csv",
            "county_charger_sales_scatter.json",
        ])
    with open(output_dir / "cleaning_summary.json", "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2)

    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
