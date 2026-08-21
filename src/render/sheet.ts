/**
 * render/sheet.ts — Sheet assembly (drawing + margins + border + title block + apparatus)
 * One model-unit space, proportional (not fixed paper size)
 */

import { DocumentMeta, Theme } from "../schema/common.js";
import { Unit, modelPerPaperMm } from "../geometry/scale.js";
import { getBbox, Polygon } from "../geometry/primitives.js";
import { formatNumber } from "./primitives.js";
import { generateDefs } from "./defs.js";
import { generateTitleBlock } from "./titleblock.js";
import { renderNorthArrow, renderScaleBar } from "./symbols.js";
import { getTheme } from "./theme.js";

export interface BboxResult {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Round a target model length to a "nice" round number (1/2/5 × 10^k), for a
 * legible scale bar (e.g. a 3.75 m target becomes a 5 m bar).
 */
function niceRoundLength(target: number): number {
  if (!isFinite(target) || target <= 0) {
    return 1;
  }
  const pow = Math.pow(10, Math.floor(Math.log10(target)));
  const frac = target / pow;
  const niceFrac = frac < 1.5 ? 1 : frac < 3.5 ? 2 : frac < 7.5 ? 5 : 10;
  return niceFrac * pow;
}

/**
 * Generate complete SVG sheet from drawing content and metadata
 * @param content Layer groups markup (already built SVG <g> content from tools)
 * @param bbox Bounding box of the drawing content
 * @param meta Document metadata (unit, scale, theme, titleBlock)
 * @param theme Theme override
 */
export function generateSheet(
  content: string,
  bbox: BboxResult,
  meta: DocumentMeta,
  theme?: Theme
): string {
  const themeToUse = theme || meta.theme || "blueprint";
  const palette = getTheme(themeToUse);
  const mpmm = modelPerPaperMm(meta.scale, meta.unit);
  const padding = 10 * mpmm; // 10mm padding in model units

  // Margin for border + title block / apparatus (top + bottom bands)
  const marginSize = 35 * mpmm;

  // Final viewBox (world space)
  const minX = bbox.minX - padding - marginSize;
  const minY = bbox.minY - padding - marginSize;
  const maxX = bbox.maxX + padding + marginSize;
  const maxY = bbox.maxY + padding + marginSize;

  const width = maxX - minX;
  const height = maxY - minY;

  // Start SVG
  const parts: string[] = [
    // width/height are "100%" (per the canvas's Approach section), not a
    // fixed pixel/unit value derived from model size — that previously made
    // the SVG's intrinsic document size equal to the tiny model-unit extent
    // (e.g. ~185x135 "px" for an 18.5x13.5m plan), so any viewer opening the
    // file standalone rendered it as a postage stamp. viewBox alone controls
    // the internal coordinate mapping; 100%/100% lets the embedding context
    // (browser tab, MCP client, <img> tag) size the drawing to fit.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${formatNumber(minX)} ${formatNumber(minY)} ${formatNumber(width)} ${formatNumber(height)}" width="100%" height="100%" style="background-color: ${palette.background};">`,
  ];

  // Add defs (patterns, markers)
  parts.push(generateDefs(meta.scale, meta.unit, themeToUse));

  // Add the actual drawing content (layer groups from tools)
  parts.push(content);

  // Border
  const borderX = bbox.minX - padding;
  const borderY = bbox.minY - padding;
  const borderW = bbox.maxX - bbox.minX + 2 * padding;
  const borderH = bbox.maxY - bbox.minY + 2 * padding;

  parts.push(
    `<rect x="${formatNumber(borderX)}" y="${formatNumber(borderY)}" width="${formatNumber(borderW)}" height="${formatNumber(borderH)}" fill="none" stroke="${palette.ink}" stroke-width="${formatNumber(0.5 * mpmm)}" />`
  );

  // Title block — top-left of the top margin band. Sized in paper-mm so its
  // text fits (wide enough for a title, tall enough for 4 stacked fields).
  if (meta.titleBlock) {
    const titleBlockW = 55 * mpmm;
    const titleBlockH = 24 * mpmm;
    const titleBlockX = borderX;
    const titleBlockY = borderY - marginSize + (marginSize - titleBlockH) / 2;

    parts.push(
      generateTitleBlock(
        meta.titleBlock,
        titleBlockX,
        titleBlockY,
        titleBlockW,
        titleBlockH,
        themeToUse,
        meta.scale,
        meta.unit
      )
    );
  }

  // North arrow — top-right corner of the top margin, well clear of the title block
  if (meta.titleBlock && meta.titleBlock.northAngle !== undefined) {
    const northSize = 12 * mpmm;
    const northX = borderX + borderW - northSize * 0.7;
    const northY = borderY - marginSize * 0.5;
    parts.push(renderNorthArrow(northX, northY, northSize, meta.titleBlock.northAngle, themeToUse));
  }

  // Scale bar — in the bottom margin band, left-aligned, at a nice round length
  // (~1/4 of the drawing width) so it never runs across the whole drawing.
  const drawingWidth = bbox.maxX - bbox.minX;
  const scaleBarLength = niceRoundLength(drawingWidth / 4);
  const scaleBarX = borderX;
  const scaleBarY = bbox.maxY + padding + marginSize * 0.4;
  parts.push(renderScaleBar(scaleBarX, scaleBarY, scaleBarLength, meta.scale, meta.unit, themeToUse));

  // Close SVG
  parts.push("</svg>");

  return parts.join("\n");
}
