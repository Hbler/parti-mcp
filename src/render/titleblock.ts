/**
 * render/titleblock.ts — Title block layout and rendering
 */

import { TitleBlock } from "../schema/common.js";
import { Theme } from "../schema/common.js";
import { modelPerPaperMm, Unit } from "../geometry/scale.js";
import { getTheme } from "./theme.js";
import { textToSvg, rectToSvg, formatNumber } from "./primitives.js";

/**
 * Generate title block SVG
 * Title block sits in the margin, contains: title, drawing number, date, project
 * All text sizes and offsets are converted from paper-mm to model units via the spec's scale
 */
export function generateTitleBlock(
  titleBlock: TitleBlock | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
  theme: Theme,
  scale: string,
  unit: Unit
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);

  if (!titleBlock) {
    return "";
  }

  const parts: string[] = ['<g id="title-block">'];

  // Background box (0.5mm paper stroke, converted to model units — this was
  // previously a raw literal, producing a stroke width comparable to the
  // whole box's own size and visually swallowing the text drawn on top of it)
  const bg = rectToSvg(x, y, width, height, palette.pochéFill, palette.ink, 0.5 * mpmm);
  parts.push(bg);

  // Four fields stacked vertically, each left-aligned across the box's full
  // width, rather than sharing lines pairwise (start+end on the same row).
  // Two fields on one line collided whenever their combined text length
  // exceeded the box width, which — since the box is sized from a fixed
  // margin fraction, not from actual text length — happened for any
  // non-trivial title/drawing-number pair. Stacking removes the collision
  // without needing text-width-aware box sizing.
  let lineY = y + 5 * mpmm;
  const lineStep = 4.5 * mpmm; // 4 lines within the title block

  if (titleBlock.title) {
    parts.push(textToSvg(titleBlock.title, x + 2.5 * mpmm, lineY, 3.5 * mpmm, palette.ink, "start"));
    lineY += lineStep;
  }
  if (titleBlock.drawingNumber) {
    parts.push(textToSvg(`#${titleBlock.drawingNumber}`, x + 2.5 * mpmm, lineY, 2.5 * mpmm, palette.ink, "start"));
    lineY += lineStep;
  }
  if (titleBlock.project) {
    parts.push(textToSvg(titleBlock.project, x + 2.5 * mpmm, lineY, 2.5 * mpmm, palette.ink, "start"));
    lineY += lineStep;
  }
  if (titleBlock.date) {
    parts.push(textToSvg(titleBlock.date, x + 2.5 * mpmm, lineY, 2.5 * mpmm, palette.ink, "start"));
    lineY += lineStep;
  }

  parts.push("</g>");
  return parts.join("\n");
}
