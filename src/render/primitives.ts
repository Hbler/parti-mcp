/**
 * render/primitives.ts — Base SVG emitters, deterministic number formatting, XML escape, text metrics
 * THE SINGLE NUMBER FORMATTER: every coordinate/length is emitted through formatNumber
 * to guarantee byte-identical SVG for identical specs
 */

export type Coordinate = [number, number];
export type Polygon = Coordinate[];
export type Polyline = Coordinate[];

/**
 * CRITICAL: The single fixed formatter for deterministic output
 * Every numeric value (coordinate, length, etc.) passes through this one function
 * Round to 4 decimal places, strip trailing zeros
 */
export function formatNumber(value: number): string {
  if (!isFinite(value)) {
    return "0";
  }

  // Round to 4 decimal places
  const rounded = Math.round(value * 10000) / 10000;

  // Convert to string
  let str = rounded.toString();

  // Strip trailing zeros after decimal point
  if (str.includes(".")) {
    str = str.replace(/\.?0+$/, "");
  }

  return str;
}

/**
 * XML escape for text content (guards against injection)
 * Escapes: < > & " '
 */
export function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Monospace text width estimation (without font-metrics dependency)
 * Fixed ADVANCE_RATIO ≈ 0.6 (monospace advance-to-em ratio)
 * Width = charCount × fontSize × ADVANCE_RATIO
 */
const MONOSPACE_ADVANCE_RATIO = 0.6;

export function estimateTextWidth(text: string, fontSizeModel: number): number {
  return text.length * fontSizeModel * MONOSPACE_ADVANCE_RATIO;
}

/**
 * Estimate text height + padding for a room-tag or bubble box
 */
export function estimateTextHeight(
  fontSizeModel: number,
  paddingModel: number
): number {
  return fontSizeModel + 2 * paddingModel;
}

/**
 * Polygon to SVG path data (closed)
 * Format: M x1 y1 L x2 y2 L x3 y3 Z
 */
export function polygonToSvg(polygon: Polygon): string {
  if (polygon.length === 0) {
    return "";
  }

  const parts: string[] = [];

  // Move to first point
  const [x0, y0] = polygon[0];
  parts.push(`M ${formatNumber(x0)} ${formatNumber(y0)}`);

  // Line to remaining points
  for (let i = 1; i < polygon.length; i++) {
    const [x, y] = polygon[i];
    parts.push(`L ${formatNumber(x)} ${formatNumber(y)}`);
  }

  // Close path
  parts.push("Z");

  return parts.join(" ");
}

/**
 * Polyline to SVG path data (open)
 * Format: M x1 y1 L x2 y2 L x3 y3 (no Z)
 */
export function polylineToSvg(path: Polyline): string {
  if (path.length === 0) {
    return "";
  }

  const parts: string[] = [];

  // Move to first point
  const [x0, y0] = path[0];
  parts.push(`M ${formatNumber(x0)} ${formatNumber(y0)}`);

  // Line to remaining points
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i];
    parts.push(`L ${formatNumber(x)} ${formatNumber(y)}`);
  }

  return parts.join(" ");
}

/**
 * Generate SVG <text> element
 */
export function textToSvg(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  fill: string = "black",
  textAnchor: "start" | "middle" | "end" = "start"
): string {
  const escaped = escapeXml(text);
  return (
    `<text x="${formatNumber(x)}" y="${formatNumber(y)}" ` +
    `font-size="${formatNumber(fontSize)}" font-family="monospace" ` +
    `fill="${fill}" text-anchor="${textAnchor}">${escaped}</text>`
  );
}

/**
 * Generate a multi-line SVG <text> using <tspan> lines, vertically centered
 * on (x, y). SVG ignores "\n" inside <text>, so multi-line labels (e.g. a room
 * name plus its area) must use tspans with explicit dy offsets.
 */
export function textLinesToSvg(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  fill: string = "black",
  textAnchor: "start" | "middle" | "end" = "middle"
): string {
  if (lines.length === 0) {
    return "";
  }
  const lineHeight = fontSize * 1.2;
  const startDy = -((lines.length - 1) / 2) * lineHeight;
  const tspans = lines
    .map((line, i) => {
      const dy = i === 0 ? startDy : lineHeight;
      return `<tspan x="${formatNumber(x)}" dy="${formatNumber(dy)}">${escapeXml(line)}</tspan>`;
    })
    .join("");
  return (
    `<text x="${formatNumber(x)}" y="${formatNumber(y)}" ` +
    `font-size="${formatNumber(fontSize)}" font-family="monospace" ` +
    `fill="${fill}" text-anchor="${textAnchor}">${tspans}</text>`
  );
}

export type LabelAnchor = {
  x: number;
  y: number;
  textAnchor: "start" | "middle" | "end";
  verticalBias: "middle" | "top" | "bottom";
};

/**
 * Resolve where an area label sits, given a 9-position choice over the
 * polygon's bounding box. `center` uses the polygon centroid (correct for
 * L-shapes); every other value is taken from the bbox, inset by `pad` (a
 * paper-mm-derived model distance) so text/halo don't spill past the edge.
 * Corner positions anchor the text TO the corner, reading inward, by setting
 * `textAnchor` (start on the left column, end on the right column); the top/
 * bottom rows set `verticalBias` so the text block grows down from the top
 * edge / up from the bottom edge instead of straddling it. Edge midpoints and
 * center stay middle-anchored.
 */
export function resolveLabelAnchor(
  polygon: Polygon,
  position: string,
  pad: number
): LabelAnchor {
  // Centroid (for center) — average of vertices, matching getCentroid's simple form.
  let cx = 0;
  let cy = 0;
  for (const [px, py] of polygon) {
    cx += px;
    cy += py;
  }
  cx /= polygon.length || 1;
  cy /= polygon.length || 1;

  if (position === "center" || !position) {
    return { x: cx, y: cy, textAnchor: "middle", verticalBias: "middle" };
  }

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [px, py] of polygon) {
    if (px < minX) minX = px;
    if (py < minY) minY = py;
    if (px > maxX) maxX = px;
    if (py > maxY) maxY = py;
  }
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const left = minX + pad;
  const right = maxX - pad;
  const top = minY + pad;
  const bottom = maxY - pad;

  // Column → x + text anchor (corners read inward); row → y + vertical bias.
  const table: Record<string, LabelAnchor> = {
    "top-left": { x: left, y: top, textAnchor: "start", verticalBias: "top" },
    "top": { x: midX, y: top, textAnchor: "middle", verticalBias: "top" },
    "top-right": { x: right, y: top, textAnchor: "end", verticalBias: "top" },
    "left": { x: left, y: midY, textAnchor: "start", verticalBias: "middle" },
    "right": { x: right, y: midY, textAnchor: "end", verticalBias: "middle" },
    "bottom-left": { x: left, y: bottom, textAnchor: "start", verticalBias: "bottom" },
    "bottom": { x: midX, y: bottom, textAnchor: "middle", verticalBias: "bottom" },
    "bottom-right": { x: right, y: bottom, textAnchor: "end", verticalBias: "bottom" },
  };
  return table[position] ?? { x: cx, y: cy, textAnchor: "middle", verticalBias: "middle" };
}

/**
 * Multi-line label with a "safe area" halo: a background rectangle in the
 * sheet/background color is drawn behind the text so busy floor hatching
 * doesn't render through it and the label stays legible. The rect is sized to
 * the widest line (monospace metrics) plus padding, centered on (x, y).
 *
 * orientation "vertical" rotates the whole label group 90° counter-clockwise
 * about (x, y) so the text reads bottom-to-top (the standard drafting
 * convention for vertical text) — useful for labeling a narrow shape along its
 * long axis. The halo rotates with the text since both live in the same group.
 */
export function textLinesWithHaloToSvg(
  lines: string[],
  x: number,
  y: number,
  fontSize: number,
  fill: string,
  haloColor: string,
  textAnchor: "start" | "middle" | "end" = "middle",
  orientation: "horizontal" | "vertical" = "horizontal",
  verticalBias: "middle" | "top" | "bottom" = "middle"
): string {
  if (lines.length === 0) {
    return "";
  }
  const lineHeight = fontSize * 1.2;
  const padX = fontSize * 0.5;
  const padY = fontSize * 0.35;
  const widest = lines.reduce((m, l) => Math.max(m, estimateTextWidth(l, fontSize)), 0);
  const boxW = widest + 2 * padX;
  const boxH = lines.length * lineHeight + 2 * padY;

  // Resolve the text block's vertical center (ty) from the incoming anchor y
  // and the vertical bias: "top" means y is the top edge (block sits below),
  // "bottom" means y is the bottom edge (block sits above), "middle" centers.
  let ty = y;
  if (verticalBias === "top") ty = y + boxH / 2;
  else if (verticalBias === "bottom") ty = y - boxH / 2;

  // Horizontal box placement follows the text anchor so the halo hugs the same
  // side the text grows from: start → box starts at x; end → box ends at x;
  // middle → centered.
  let boxX: number;
  if (textAnchor === "start") boxX = x - padX;
  else if (textAnchor === "end") boxX = x - boxW + padX;
  else boxX = x - boxW / 2;
  const boxY = ty - boxH / 2;

  const halo =
    `<rect x="${formatNumber(boxX)}" y="${formatNumber(boxY)}" ` +
    `width="${formatNumber(boxW)}" height="${formatNumber(boxH)}" ` +
    `fill="${haloColor}" fill-opacity="0.85" stroke="none" />`;
  const body = halo + "\n" + textLinesToSvg(lines, x, ty, fontSize, fill, textAnchor);
  if (orientation === "vertical") {
    // -90° about the anchor: text reads bottom-to-top (counter-clockwise).
    return `<g transform="rotate(-90, ${formatNumber(x)}, ${formatNumber(ty)})">\n${body}\n</g>`;
  }
  return body;
}

/**
 * Generate SVG <circle> element
 */
export function circleToSvg(
  cx: number,
  cy: number,
  r: number,
  fill: string = "none",
  stroke: string = "black",
  strokeWidth: number = 1
): string {
  return (
    `<circle cx="${formatNumber(cx)}" cy="${formatNumber(cy)}" ` +
    `r="${formatNumber(r)}" fill="${fill}" stroke="${stroke}" ` +
    `stroke-width="${formatNumber(strokeWidth)}" />`
  );
}

/**
 * Generate SVG <line> element
 */
export function lineToSvg(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string = "black",
  strokeWidth: number = 1,
  strokeDasharray?: string
): string {
  let attrs = `x1="${formatNumber(x1)}" y1="${formatNumber(y1)}" ` +
    `x2="${formatNumber(x2)}" y2="${formatNumber(y2)}" ` +
    `stroke="${stroke}" stroke-width="${formatNumber(strokeWidth)}"`;

  if (strokeDasharray) {
    attrs += ` stroke-dasharray="${strokeDasharray}"`;
  }

  return `<line ${attrs} />`;
}

/**
 * Generate SVG <path> element
 */
export function pathToSvg(
  d: string,
  fill: string = "none",
  stroke: string = "black",
  strokeWidth: number = 1,
  strokeDasharray?: string,
  fillRule?: string
): string {
  let attrs = `d="${d}" fill="${fill}" stroke="${stroke}" ` +
    `stroke-width="${formatNumber(strokeWidth)}"`;

  if (fillRule) {
    attrs += ` fill-rule="${fillRule}"`;
  }
  if (strokeDasharray) {
    attrs += ` stroke-dasharray="${strokeDasharray}"`;
  }

  return `<path ${attrs} />`;
}

/**
 * Generate SVG <rect> element
 */
export function rectToSvg(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string = "none",
  stroke: string = "black",
  strokeWidth: number = 1
): string {
  return (
    `<rect x="${formatNumber(x)}" y="${formatNumber(y)}" ` +
    `width="${formatNumber(width)}" height="${formatNumber(height)}" ` +
    `fill="${fill}" stroke="${stroke}" stroke-width="${formatNumber(strokeWidth)}" />`
  );
}
