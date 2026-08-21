/**
 * render/defs.ts — SVG <defs>: material hatch patterns and markers
 * Patterns use patternUnits="userSpaceOnUse" for scale-correct hatching
 */

import { Unit, modelPerPaperMm } from "../geometry/scale.js";
import { formatNumber } from "./primitives.js";
import { getTheme } from "./theme.js";
import { Theme } from "../schema/common.js";

/**
 * Generate SVG <defs> section with all patterns and markers
 * Material hatch patterns use paper-mm tile sizes, converted to model units
 */
export function generateDefs(scale: string, unit: Unit, theme: Theme): string {
  const mpmm = modelPerPaperMm(scale, unit);
  const palette = getTheme(theme);

  const parts: string[] = ["<defs>"];

  // ========================================================================
  // Material Hatch Patterns (userSpaceOnUse for scale-correct density)
  // ========================================================================

  // Concrete: stipple + triangles
  parts.push(
    `<pattern id="hatch-concrete" width="${formatNumber(3 * mpmm)}" height="${formatNumber(3 * mpmm)}" ` +
    `patternUnits="userSpaceOnUse">` +
    `<circle cx="${formatNumber(1.5 * mpmm)}" cy="${formatNumber(1.5 * mpmm)}" r="${formatNumber(0.5 * mpmm)}" fill="${palette.hatchInk}" />` +
    `<circle cx="${formatNumber(0.5 * mpmm)}" cy="${formatNumber(0.5 * mpmm)}" r="${formatNumber(0.3 * mpmm)}" fill="${palette.hatchInk}" />` +
    `</pattern>`
  );

  // Brick: 45° diagonal lines
  parts.push(
    `<pattern id="hatch-brick" width="${formatNumber(2 * mpmm)}" height="${formatNumber(2 * mpmm)}" ` +
    `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="${formatNumber(2 * mpmm)}" stroke="${palette.hatchInk}" stroke-width="${formatNumber(0.3 * mpmm)}" />` +
    `</pattern>`
  );

  // Masonry: larger 45° lines
  parts.push(
    `<pattern id="hatch-masonry" width="${formatNumber(4 * mpmm)}" height="${formatNumber(4 * mpmm)}" ` +
    `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="${formatNumber(4 * mpmm)}" stroke="${palette.hatchInk}" stroke-width="${formatNumber(0.4 * mpmm)}" />` +
    `</pattern>`
  );

  // Insulation: batting lines (horizontal + short perpendiculars)
  parts.push(
    `<pattern id="hatch-insulation" width="${formatNumber(2 * mpmm)}" height="${formatNumber(1.5 * mpmm)}" ` +
    `patternUnits="userSpaceOnUse">` +
    `<line x1="0" y1="${formatNumber(0.75 * mpmm)}" x2="${formatNumber(2 * mpmm)}" y2="${formatNumber(0.75 * mpmm)}" stroke="${palette.hatchInk}" stroke-width="${formatNumber(0.2 * mpmm)}" />` +
    `<line x1="${formatNumber(0.3 * mpmm)}" y1="${formatNumber(0.45 * mpmm)}" x2="${formatNumber(0.3 * mpmm)}" y2="${formatNumber(1.05 * mpmm)}" stroke="${palette.hatchInk}" stroke-width="${formatNumber(0.15 * mpmm)}" />` +
    `<line x1="${formatNumber(1.3 * mpmm)}" y1="${formatNumber(0.45 * mpmm)}" x2="${formatNumber(1.3 * mpmm)}" y2="${formatNumber(1.05 * mpmm)}" stroke="${palette.hatchInk}" stroke-width="${formatNumber(0.15 * mpmm)}" />` +
    `</pattern>`
  );

  // Earth: dense 45° cross-hatch
  parts.push(
    `<pattern id="hatch-earth" width="${formatNumber(1.5 * mpmm)}" height="${formatNumber(1.5 * mpmm)}" ` +
    `patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<line x1="0" y1="0" x2="0" y2="${formatNumber(1.5 * mpmm)}" stroke="${palette.hatchInk}" stroke-width="${formatNumber(0.25 * mpmm)}" />` +
    `</pattern>`
  );

  // Lawn: fine stipple
  parts.push(
    `<pattern id="hatch-lawn" width="${formatNumber(2 * mpmm)}" height="${formatNumber(2 * mpmm)}" ` +
    `patternUnits="userSpaceOnUse">` +
    `<circle cx="${formatNumber(0.5 * mpmm)}" cy="${formatNumber(0.5 * mpmm)}" r="${formatNumber(0.2 * mpmm)}" fill="${palette.hatchInk}" />` +
    `<circle cx="${formatNumber(1.5 * mpmm)}" cy="${formatNumber(1.5 * mpmm)}" r="${formatNumber(0.2 * mpmm)}" fill="${palette.hatchInk}" />` +
    `</pattern>`
  );

  // Pavers: grid pattern
  parts.push(
    `<pattern id="hatch-pavers" width="${formatNumber(3 * mpmm)}" height="${formatNumber(3 * mpmm)}" ` +
    `patternUnits="userSpaceOnUse">` +
    `<rect x="0" y="0" width="${formatNumber(3 * mpmm)}" height="${formatNumber(3 * mpmm)}" fill="none" stroke="${palette.hatchInk}" stroke-width="${formatNumber(0.2 * mpmm)}" />` +
    `</pattern>`
  );

  // ========================================================================
  // Markers for Dimensions and Annotations
  // ========================================================================

  // Dimension tick mark (small perpendicular line)
  parts.push(
    `<marker id="marker-tick" markerWidth="${formatNumber(2 * mpmm)}" markerHeight="${formatNumber(2 * mpmm)}" ` +
    `refX="${formatNumber(1 * mpmm)}" refY="${formatNumber(1 * mpmm)}" markerUnits="userSpaceOnUse">` +
    `<line x1="0" y1="${formatNumber(0.5 * mpmm)}" x2="0" y2="${formatNumber(1.5 * mpmm)}" stroke="${palette.ink}" stroke-width="${formatNumber(0.2 * mpmm)}" />` +
    `</marker>`
  );

  // Arrow for dimension lines (small triangle)
  parts.push(
    `<marker id="marker-arrowhead" markerWidth="${formatNumber(3 * mpmm)}" markerHeight="${formatNumber(3 * mpmm)}" ` +
    `refX="${formatNumber(1.5 * mpmm)}" refY="${formatNumber(1.5 * mpmm)}" markerUnits="userSpaceOnUse" orient="auto">` +
    `<polygon points="0,0 ${formatNumber(3 * mpmm)},${formatNumber(1.5 * mpmm)} 0,${formatNumber(3 * mpmm)}" fill="${palette.ink}" />` +
    `</marker>`
  );

  // North arrow: circle with N
  parts.push(
    `<marker id="marker-north" markerWidth="${formatNumber(6 * mpmm)}" markerHeight="${formatNumber(6 * mpmm)}" ` +
    `refX="${formatNumber(3 * mpmm)}" refY="${formatNumber(3 * mpmm)}" markerUnits="userSpaceOnUse">` +
    `<circle cx="${formatNumber(3 * mpmm)}" cy="${formatNumber(3 * mpmm)}" r="${formatNumber(2.5 * mpmm)}" fill="none" stroke="${palette.ink}" stroke-width="${formatNumber(0.3 * mpmm)}" />` +
    `<text x="${formatNumber(3 * mpmm)}" y="${formatNumber(4 * mpmm)}" font-size="${formatNumber(1.5 * mpmm)}" font-family="monospace" fill="${palette.ink}" text-anchor="middle">N</text>` +
    `</marker>`
  );

  parts.push("</defs>");

  return parts.join("\n");
}

/**
 * Map a material / surface / landscape name to a hatch pattern id.
 * Unknown names fall back to "none" (solid poché) per the Safeguards, rather
 * than silently hatching everything as concrete.
 */
export function getMaterialPatternId(material: string): string {
  const map: Record<string, string> = {
    // Wall / building materials
    concrete: "hatch-concrete",
    brick: "hatch-brick",
    masonry: "hatch-masonry",
    insulation: "hatch-insulation",
    earth: "hatch-earth",
    wood: "hatch-brick",
    // Site hardscape surfaces
    asphalt: "hatch-earth",
    pavers: "hatch-pavers",
    gravel: "hatch-concrete",
    patio: "hatch-pavers",
    deck: "hatch-masonry",
    driveway: "hatch-concrete",
    sidewalk: "hatch-pavers",
    // Soft landscape
    lawn: "hatch-lawn",
    garden: "hatch-lawn",
    planting: "hatch-lawn",
    park: "hatch-lawn",
    meadow: "hatch-lawn",
    // Explicit solid
    solid: "none",
  };

  return map[material] || "none";
}
