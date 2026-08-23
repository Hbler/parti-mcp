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
  orientation: "horizontal" | "vertical" = "horizontal"
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
  // Centered on (x, y) for the middle anchor (the only anchor rooms use).
  const boxX = x - boxW / 2;
  const boxY = y - boxH / 2;
  const halo =
    `<rect x="${formatNumber(boxX)}" y="${formatNumber(boxY)}" ` +
    `width="${formatNumber(boxW)}" height="${formatNumber(boxH)}" ` +
    `fill="${haloColor}" fill-opacity="0.85" stroke="none" />`;
  const body = halo + "\n" + textLinesToSvg(lines, x, y, fontSize, fill, textAnchor);
  if (orientation === "vertical") {
    // -90° about the anchor: text reads bottom-to-top (counter-clockwise).
    return `<g transform="rotate(-90, ${formatNumber(x)}, ${formatNumber(y)})">\n${body}\n</g>`;
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
