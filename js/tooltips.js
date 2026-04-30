import { formatNumber } from "./utils.js";

const d3 = globalThis.d3;

export function showTooltip(tooltip, anchorSvg, event, html) {
  const [x, y] = d3.pointer(event, anchorSvg.node());
  tooltip.classed("hidden", false)
    .style("left", `${x + 18}px`)
    .style("top", `${y + 18}px`)
    .html(html);
}

export function hideTooltip(tooltip) {
  tooltip.classed("hidden", true);
}

export function areaTooltip(name, period, record, hint = "") {
  return `<strong>${name}</strong><br>
    <b>${period}</b><br>
    Electric: ${formatNumber(record.Electric)}<br>
    Hydrogen: ${formatNumber(record.Hydrogen)}<br>
    PHEV: ${formatNumber(record.PHEV)}<br>
    <b>Total: ${formatNumber(record.total)}</b>${hint ? `<br><span class="tooltip-hint">${hint}</span>` : ""}`;
}

export function glyphTooltip(name, period, circle) {
  return `<strong>${name}</strong><br>
    <b>${period}</b><br>
    ${circle.type}: <b>${formatNumber(circle.value)}</b>`;
}

export function scatterTooltipHtml(d, period) {
  return `<strong>${d.county} County</strong><br>
    <b>${period}</b><br>
    EV sales: <b>${formatNumber(d.zev_sales)}</b><br>
    ZEV chargers: <b>${formatNumber(d.chargers)}</b>`;
}
