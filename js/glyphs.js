import { CONFIG } from "./config.js";
import { formatNumber, salesForArea } from "./utils.js";
import { glyphTooltip, hideTooltip, showTooltip } from "./tooltips.js";

const d3 = globalThis.d3;

function radius(value, scale) {
  const v = Number(value || 0);
  return v > 0 ? Math.max(2.2, scale(v)) : 0;
}

function circleLayout(record, scale) {
  const rE = radius(record.Electric, scale);
  const rH = radius(record.Hydrogen, scale);
  const rP = radius(record.PHEV, scale);

  const e = { type: "Electric", value: record.Electric || 0, r: rE, x: 0, y: 0, color: CONFIG.colors.Electric };
  const h = { type: "Hydrogen", value: record.Hydrogen || 0, r: rH, x: rE + rH, y: 0, color: CONFIG.colors.Hydrogen };

  let px = 0;
  let py = 0;
  const d = rE + rH;
  if (rP > 0 && rE > 0 && rH > 0 && d > 0) {
    px = ((rE + rP) ** 2 - (rH + rP) ** 2 + d ** 2) / (2 * d);
    py = -Math.sqrt(Math.max(0, (rE + rP) ** 2 - px ** 2));
  } else if (rP > 0) {
    px = d / 2;
    py = -rP - Math.max(rE, rH, 2);
  }
  const p = { type: "PHEV", value: record.PHEV || 0, r: rP, x: px, y: py, color: CONFIG.colors.PHEV };

  const visible = [e, h, p].filter(d => d.r > 0);
  const minX = d3.min(visible, d => d.x - d.r) || 0;
  const maxX = d3.max(visible, d => d.x + d.r) || 0;
  const minY = d3.min(visible, d => d.y - d.r) || 0;
  const maxY = d3.max(visible, d => d.y + d.r) || 0;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  return [e, h, p].map(d => ({ ...d, x: d.x - cx, y: d.y - cy }));
}

export function renderGlyphs({ features, keyFn, nameFn, dataset, scale, animate, period, path, glyphLayer, tooltip, svg }) {
  const groups = glyphLayer.selectAll("g.glyph")
    .data(features, d => keyFn(d));

  groups.exit().transition().duration(250).style("opacity", 0).remove();

  const enter = groups.enter()
    .append("g")
    .attr("class", "glyph")
    .style("opacity", 0)
    .attr("transform", d => `translate(${path.centroid(d)})`);

  enter.append("title");
  enter.transition().duration(350).style("opacity", 1);

  const merged = enter.merge(groups)
    .attr("transform", d => `translate(${path.centroid(d)})`);

  merged.each(function(feature) {
    const g = d3.select(this);
    const key = keyFn(feature);
    const record = salesForArea(dataset, period, key);
    const circles = circleLayout(record, scale);
    g.select("title").text(`${nameFn(feature)} ${period}: ${formatNumber(record.total)} total`);

    const circleSel = g.selectAll("circle")
      .data(circles, d => d.type)
      .join(
        enter => enter.append("circle")
          .attr("cx", 0).attr("cy", 0).attr("r", 0)
          .attr("fill", d => d.color)
          .attr("fill-opacity", 0.88)
          .attr("stroke", "white")
          .attr("stroke-width", 1.2),
        update => update,
        exit => exit.transition().duration(250).attr("r", 0).remove()
      );

    circleSel
      .on("mousemove", (event, d) => showTooltip(tooltip, svg, event, glyphTooltip(nameFn(feature), period, d)))
      .on("mouseout", () => hideTooltip(tooltip));

    const transition = animate ? circleSel.transition().duration(650).ease(d3.easeCubicOut) : circleSel;
    transition.attr("cx", d => d.x).attr("cy", d => d.y).attr("r", d => d.r);
  });
}
