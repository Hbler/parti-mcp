/**
 * render/theme.ts — Themes (blueprint/whiteprint), palettes, lineweight/linetype tables
 * All annotation is authored in paper-mm and converted to model units via scale
 */

import { Theme } from "../schema/common.js";
import { modelPerPaperMm, Unit } from "../geometry/scale.js";

export interface ThemePalette {
  background: string;        // SVG background color
  ink: string;               // Primary line/text color
  pochéFill: string;         // Solid wall/building fill
  buildingFill: string;      // Denser figure-ground fill for site-plan buildings
  hatchInk: string;          // Hatch pattern line color
  accent: string;            // Highlight/accent color
}

export interface ThemeConfig {
  palette: ThemePalette;
  lineweights: Record<string, number>; // paper-mm for each role
  linetypes: Record<string, string>;   // SVG dasharray for each type
}

/**
 * Lineweight roles in paper-mm (from architecture standards)
 */
const lineweightsPaperMm: Record<string, number> = {
  heavy: 0.7,   // Cut walls / building outline
  medium: 0.5,  // Frames / secondary geometry
  light: 0.35,  // Surfaces / fixtures
  fine: 0.25,   // Dimensions / hatching / grid
};

/**
 * Linetype patterns (dasharray in paper-mm)
 */
const linetypesPaperMm: Record<string, string> = {
  solid: "", // No dasharray
  dashed: "2,2",      // 2mm dash, 2mm gap
  dashdot: "2,1,0.5,1", // 2mm dash, 1mm gap, 0.5mm dot, 1mm gap
};

/**
 * Blueprint theme (Prussian blue ground, light cyan/white linework)
 */
const blueprintPalette: ThemePalette = {
  background: "#0B3D91",       // Prussian blue
  ink: "#E0F2FF",              // Pale cyan
  pochéFill: "#4A78C0",        // Mid blue — clearly lighter than the ground so solid poché reads
  buildingFill: "#BBD9FF",     // Pale, near-ink figure — building mass reads as solid figure-ground on a busy site
  hatchInk: "#A0D0FF",         // Light blue for hatching
  accent: "#FFEB3B",           // Yellow highlight
};

/**
 * Whiteprint theme (white ground, dark line work)
 */
const whiteprintPalette: ThemePalette = {
  background: "#FFFFFF",       // White
  ink: "#000000",              // Black
  pochéFill: "#808080",        // Mid gray — solid poché reads clearly on white
  buildingFill: "#404040",     // Dark gray figure — building mass reads as solid figure-ground on a busy site
  hatchInk: "#666666",         // Dark gray for hatching
  accent: "#FF6B6B",           // Red highlight
};

/**
 * Get theme palette by name
 */
export function getTheme(theme: Theme): ThemePalette {
  if (theme === "whiteprint") {
    return whiteprintPalette;
  }
  return blueprintPalette;
}

/**
 * Get lineweight in model units for a given role, scale, and unit
 * Converts paper-mm to model units
 */
export function getLineweight(
  role: string,
  scale: string,
  unit: Unit
): number {
  const paperMm = lineweightsPaperMm[role] || lineweightsPaperMm.light;
  const mpmm = modelPerPaperMm(scale, unit);
  return paperMm * mpmm;
}

/**
 * Get linetype dasharray (SVG format) for a given type
 * Returns undefined for solid (no dasharray needed)
 * Note: dasharray values are in paper-mm; caller must convert to model units
 */
export function getLinetype(
  linetype: string,
  scale: string,
  unit: Unit
): string | undefined {
  const dasharray = linetypesPaperMm[linetype];
  if (!dasharray) {
    return undefined;
  }

  if (linetype === "solid") {
    return undefined;
  }

  // Convert dasharray from paper-mm to model units
  const mpmm = modelPerPaperMm(scale, unit);
  const parts = dasharray.split(",").map((s) => {
    const mm = parseFloat(s.trim());
    return (mm * mpmm).toString();
  });

  return parts.join(",");
}

/**
 * Resolve a color (safe token or theme default)
 * If color is provided, return it; otherwise return theme ink
 */
export function resolveColor(
  color: string | undefined,
  theme: Theme
): string {
  if (color) {
    return color;
  }
  return getTheme(theme).ink;
}

/**
 * Resolve stroke color
 */
export function resolveStroke(
  stroke: string | undefined,
  theme: Theme
): string {
  return resolveColor(stroke, theme);
}

/**
 * Resolve fill color
 */
export function resolveFill(
  fill: string | undefined,
  theme: Theme
): string {
  if (fill) {
    return fill;
  }
  return getTheme(theme).pochéFill;
}

/**
 * Parse a "#rgb" or "#rrggbb" hex color (the safe color-token format enforced
 * by schema validation) into 0-255 RGB components. Returns null for anything
 * else rather than throwing, so callers can fall back to a theme default.
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex);
  if (short) {
    return {
      r: parseInt(short[1] + short[1], 16),
      g: parseInt(short[2] + short[2], 16),
      b: parseInt(short[3] + short[3], 16),
    };
  }
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (full) {
    return {
      r: parseInt(full[1], 16),
      g: parseInt(full[2], 16),
      b: parseInt(full[3], 16),
    };
  }
  return null;
}

/**
 * Standard perceptual luminance weighting, normalized to [0, 1].
 */
function relativeLuminance(rgb: { r: number; g: number; b: number }): number {
  return (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
}

/**
 * Pick a legible text color for a given background fill, instead of always
 * using the theme's ink color regardless of what it's painted on.
 *
 * Why this exists: an element's per-element `style.fill` override (e.g. a
 * highlighted room) can be a light color close in lightness to the
 * blueprint theme's own pale `ink` (label text) color — text and background
 * both near-white reads as invisible.
 *
 * This picks between the theme's `ink` and its `background` — both already
 * theme-appropriate colors, not generic black/white — by choosing whichever
 * one is *further in luminance* from the target fill. That "further, not a
 * fixed side" framing matters: `background` is the dark color in the
 * blueprint theme but the light color in whiteprint, so a fixed rule like
 * "light fill → use background" is only correct for one theme and silently
 * inverts (picks the *matching*-lightness color, i.e. still invisible) in
 * the other. Comparing actual luminance distance is theme-agnostic.
 */
export function getContrastingTextColor(
  bgColor: string | undefined,
  theme: Theme
): string {
  const palette = getTheme(theme);
  if (!bgColor) {
    return palette.ink;
  }
  const fillRgb = hexToRgb(bgColor);
  if (!fillRgb) {
    return palette.ink;
  }
  const inkRgb = hexToRgb(palette.ink);
  const backgroundRgb = hexToRgb(palette.background);
  if (!inkRgb || !backgroundRgb) {
    return palette.ink;
  }

  const fillLuminance = relativeLuminance(fillRgb);
  const inkContrast = Math.abs(fillLuminance - relativeLuminance(inkRgb));
  const backgroundContrast = Math.abs(fillLuminance - relativeLuminance(backgroundRgb));

  return backgroundContrast > inkContrast ? palette.background : palette.ink;
}
