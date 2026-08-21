import type { Style, Label } from "../schema.js";
import type { PolygonEntity, LinearEntity } from "../geometry.js";
import { bufferPath } from "../geometry.js";

/**
 * Escape XML special characters for safe SVG embedding
 * @param text Text to escape
 * @returns Escaped text safe for XML/SVG
 */
export function xmlEscape(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Render a polygon entity to SVG polygon element
 * @param entity PolygonEntity with polygon coordinates and optional style
 * @param styleOverride Optional style to override entity style
 * @returns SVG polygon element as string
 */
export function renderPolygonEntity(
  entity: PolygonEntity,
  styleOverride?: Style
): string {
  const style = styleOverride || entity.style || {};
  const polygon = entity.polygon;

  if (polygon.length === 0 || polygon[0].length === 0) {
    return "";
  }

  // Extract outer ring (index 0)
  const outerRing = polygon[0];

  // Build points attribute
  const points = outerRing.map((coord) => `${coord[0]},${coord[1]}`).join(" ");

  // Build style attribute
  const styleAttr = buildStyleAttribute(style);

  return `<polygon points="${points}" style="${styleAttr}" />`;
}

/**
 * Render a linear entity to SVG polygon element (buffered path)
 * @param entity LinearEntity with centerline path and width
 * @param styleOverride Optional style to override entity style
 * @returns SVG polygon element as string
 */
export function renderLinearEntity(
  entity: LinearEntity,
  styleOverride?: Style
): string {
  const style = styleOverride || entity.style || {};

  // Buffer the path to create a polygon
  const bufferedPolygon = bufferPath(entity.path, entity.width);

  // Create a temporary PolygonEntity and render it
  const polygonEntity: PolygonEntity = {
    polygon: bufferedPolygon,
    style,
  };

  return renderPolygonEntity(polygonEntity, style);
}

/**
 * Render a label to SVG text element
 * @param label Label object with text and optional position/size
 * @param positionOverride Optional position to override label position
 * @returns SVG text element as string
 */
export function renderLabel(
  label: Label,
  positionOverride?: [number, number]
): string {
  const position = positionOverride || (label.position as [number, number] | undefined) || [0, 0];
  const size = label.size || 12;
  const escapedText = xmlEscape(label.text);

  const x = position[0];
  const y = position[1];

  return `<text x="${x}" y="${y}" style="font-size:${size}px">${escapedText}</text>`;
}

/**
 * Compose multiple SVG elements into a complete SVG document
 * @param background Optional background color (hex string)
 * @param elements Array of SVG element strings
 * @param labels Array of SVG text element strings
 * @param viewBox ViewBox string (e.g., "0 0 100 100")
 * @returns Complete SVG document as string
 */
export function composeSVG(
  background: string | undefined,
  elements: string[],
  labels: string[],
  viewBox: string
): string {
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="100%" height="100%">`;

  // Add defs section (empty for now, can add patterns/gradients later)
  svg += `<defs></defs>`;

  // Add background if provided
  if (background) {
    svg += `<rect width="100%" height="100%" style="fill:${background}" />`;
  }

  // Add all elements
  for (const element of elements) {
    svg += element;
  }

  // Add all labels
  for (const label of labels) {
    svg += label;
  }

  svg += `</svg>`;

  return svg;
}

/**
 * Helper: Build SVG style attribute from Style object
 * @param style Style object
 * @returns CSS style string
 */
function buildStyleAttribute(style: Style): string {
  const parts: string[] = [];

  if (style.fill) {
    parts.push(`fill:${style.fill}`);
  } else {
    parts.push("fill:#cccccc");
  }

  if (style.stroke) {
    parts.push(`stroke:${style.stroke}`);
  } else {
    parts.push("stroke:#000000");
  }

  if (style.strokeWidth !== undefined) {
    parts.push(`stroke-width:${style.strokeWidth}`);
  } else {
    parts.push("stroke-width:1");
  }

  if (style.opacity !== undefined) {
    parts.push(`opacity:${style.opacity}`);
  }

  return parts.join(";");
}

// Re-export types for convenience
export type { PolygonEntity, LinearEntity } from "../geometry.js";
