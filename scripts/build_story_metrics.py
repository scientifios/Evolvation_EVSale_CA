import argparse
import json
from pathlib import Path

import pandas as pd


FUELS = ["Electric", "Hydrogen", "PHEV"]


def period_sort_key(period: str) -> tuple[int, int]:
    year, quarter = period.split("-Q")
    return int(year), int(quarter)


def pct_change(current: float, previous: float) -> float | None:
    if previous <= 0:
        return None
    return (current - previous) / previous


def records_by_period(county_sales: pd.DataFrame) -> dict:
    totals = (
        county_sales.groupby(["period", "year", "quarter"], as_index=False)[FUELS + ["total"]]
        .sum()
        .sort_values(["year", "quarter"])
    )
    periods = totals["period"].tolist()
    county_by_period = {
        period: frame.sort_values("total", ascending=False)
        for period, frame in county_sales.groupby("period", sort=False)
    }

    result = {}
    previous_total_by_county = {}
    previous_state_total = 0

    for _, row in totals.iterrows():
        period = row["period"]
        state_total = int(row["total"])
        fuel_values = {fuel: int(row[fuel]) for fuel in FUELS}
        fuel_share = {
            fuel: (fuel_values[fuel] / state_total if state_total else 0)
            for fuel in FUELS
        }

        counties = county_by_period.get(period, pd.DataFrame())
        top_counties = []
        growth_counties = []
        current_total_by_county = {}

        for _, county_row in counties.iterrows():
            county = str(county_row["county"])
            total = int(county_row["total"])
            current_total_by_county[county] = total
            if len(top_counties) < 8:
                top_counties.append({"county": county, "total": total})

            previous = previous_total_by_county.get(county, 0)
            delta = total - previous
            if delta > 0:
                growth_counties.append({
                    "county": county,
                    "delta": int(delta),
                    "total": total,
                    "previous": int(previous),
                    "pct": pct_change(total, previous),
                })

        growth_counties.sort(key=lambda d: d["delta"], reverse=True)
        result[period] = {
            "total": state_total,
            "Electric": fuel_values["Electric"],
            "Hydrogen": fuel_values["Hydrogen"],
            "PHEV": fuel_values["PHEV"],
            "fuelShare": fuel_share,
            "previousPeriod": periods[periods.index(period) - 1] if periods.index(period) > 0 else None,
            "qoqDelta": int(state_total - previous_state_total),
            "qoqPct": pct_change(state_total, previous_state_total),
            "topCounties": top_counties,
            "growthCounties": growth_counties[:8],
        }

        previous_total_by_county = current_total_by_county
        previous_state_total = state_total

    return result


def charger_summary(scatter_path: Path) -> dict:
    if not scatter_path.exists():
        return {}

    scatter = pd.read_csv(scatter_path)
    if scatter.empty:
        return {}

    scatter["period_key"] = scatter["period"].apply(period_sort_key)
    latest_period = sorted(scatter["period"].unique(), key=period_sort_key)[-1]
    latest = scatter[scatter["period"] == latest_period]
    total_chargers = int(latest["chargers"].sum())
    total_sales = int(latest["zev_sales"].sum())
    return {
        "latestPeriod": latest_period,
        "totalChargers": total_chargers,
        "totalSales": total_sales,
        "salesPerCharger": total_sales / total_chargers if total_chargers else None,
        "topChargerCounty": latest.sort_values("chargers", ascending=False).iloc[0][["county", "chargers"]].to_dict(),
    }


def main():
    parser = argparse.ArgumentParser(description="Build story-level metrics for the EV sales visualization.")
    parser.add_argument("--county-sales", default="data/clean/county_sales_wide.csv")
    parser.add_argument("--scatter", default="data/clean/county_charger_sales_scatter.csv")
    parser.add_argument("--output", default="data/clean/story_metrics.json")
    args = parser.parse_args()

    county_sales = pd.read_csv(args.county_sales)
    county_sales = county_sales.sort_values(["year", "quarter", "county"])

    statewide = (
        county_sales.groupby(["period", "year", "quarter"], as_index=False)[FUELS + ["total"]]
        .sum()
        .sort_values(["year", "quarter"])
    )
    statewide_records = [
        {
            "period": row["period"],
            "year": int(row["year"]),
            "quarter": int(row["quarter"]),
            "Electric": int(row["Electric"]),
            "Hydrogen": int(row["Hydrogen"]),
            "PHEV": int(row["PHEV"]),
            "total": int(row["total"]),
        }
        for _, row in statewide.iterrows()
    ]

    by_period = records_by_period(county_sales)
    latest_period = statewide_records[-1]["period"] if statewide_records else None
    peak = max(statewide_records, key=lambda d: d["total"]) if statewide_records else None

    payload = {
        "timeline": [d["period"] for d in statewide_records],
        "statewide": statewide_records,
        "byPeriod": by_period,
        "latestPeriod": latest_period,
        "peakPeriod": peak,
        "chargerSummary": charger_summary(Path(args.scatter)),
    }

    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(json.dumps({
        "output": str(output),
        "periods": len(payload["timeline"]),
        "latestPeriod": latest_period,
    }, indent=2))


if __name__ == "__main__":
    main()
