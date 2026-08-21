/**
 * render/symbols.ts — Door swing, window glazing, north arrow, scale bar, grid bubble, dimension strings
 */

import { Theme } from "../schema/common.js";
import { Unit, modelPerPaperMm, formatDimensionValue, getScaleBarStops } from "../geometry/scale.js";
import { getPointAlongPath, getPerpendicular, getPathDirection, getDoorcSwingArc } from "../geometry/primitives.js";
import { getTheme, getLineweight } from "./theme.js";
import {
  formatNumber,
  escapeXml,
  estimateTextWidth,
  polylineToSvg,
  lineToSvg,
  circleToSvg,
  textToSvg,
  pathToSvg,
  Coordinate,
  Polyline,
} from "./primitives.js";

/**
 * Render a door swing (leaf line + 90° arc)
 * door swing = leaf line (hinge to jamb) + sweep arc from hinge
 */
export function renderDoorSwing(
  wallPath: Polyline,
  positionAlongWall: number,
  doorWidth: number,
  hingeAtStart: boolean,
  swingRight: boolean,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const parts: string[] = ['<g id="door-swing">'];

  // Get the arc path
  const arcPath = getDoorcSwingArc(
    wallPath,
    positionAlongWall,
    doorWidth,
    hingeAtStart,
    swingRight
  );

  // arcPath[0] is the hinge (pivot). arcPath[1..] is the quarter arc from the
  // closed jamb (along the wall) to the fully-open leaf tip (perpendicular).
  const hinge = arcPath[0];
  const arc = arcPath.slice(1);

  // Render the single leaf line: hinge → open leaf tip (perpendicular to wall).
  // Together with the arc this reads as a clean 90° swing.
  if (arc.length >= 1) {
    const openTip = arc[arc.length - 1];
    const leaf = lineToSvg(
      hinge[0],
      hinge[1],
      openTip[0],
      openTip[1],
      palette.ink,
      getLineweight("light", "1:50", "m")
    );
    parts.push(leaf);
  }

  // Render swing arc (closed jamb → open tip) as a polyline approximation.
  if (arc.length > 1) {
    const arcSvg = polylineToSvg(arc);
    const arcElement = pathToSvg(
      arcSvg,
      "none",
      palette.ink,
      getLineweight("light", "1:50", "m")
    );
    parts.push(arcElement);
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Render window glazing (2-3 parallel lines across the opening)
 */
export function renderWindowGlazing(
  wallPath: Polyline,
  positionAlongWall: number,
  windowWidth: number,
  wallThickness: number,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const parts: string[] = ['<g id="window-glazing">'];

  // Get true wall direction at this position.
  const wallDir = getPathDirection(wallPath, positionAlongWall);

  // Three glazing lines run parallel to the wall centerline, offset across the
  // wall thickness: the two wall faces and the centerline. Each spans the
  // window width along the true wall direction (fixing the old 0.7071 hack,
  // which was only correct for a 45° wall).
  const half = windowWidth / 2;
  const faceOffsets = [-(wallThickness / 2), 0, wallThickness / 2];

  for (const faceOffset of faceOffsets) {
    // Point on this face at the window center.
    const facePt = getPerpendicular(wallPath, positionAlongWall, faceOffset);
    const line = lineToSvg(
      facePt[0] - half * wallDir[0],
      facePt[1] - half * wallDir[1],
      facePt[0] + half * wallDir[0],
      facePt[1] + half * wallDir[1],
      palette.ink,
      getLineweight("light", "1:50", "m")
    );
    parts.push(line);
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Render a barrier (fence / wall / hedge / gate) as a per-type line symbol so
 * it reads at a glance and stands off a busy site ground, rather than a faint
 * uniform thin line.
 *  - fence: medium line with periodic perpendicular tick posts
 *  - wall:  heavy solid line
 *  - hedge: dashed line
 *  - gate:  light broken (long-dash) line
 */
export function renderBarrier(
  path: Polyline,
  barrierType: string,
  scale: string,
  unit: Unit,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);
  const parts: string[] = ['<g id="barrier">'];

  const pathData = polylineToSvg(path);

  if (barrierType === "wall") {
    parts.push(
      pathToSvg(pathData, "none", palette.ink, getLineweight("heavy", scale, unit))
    );
  } else if (barrierType === "hedge") {
    // Dashed line (dash/gap authored in paper-mm → model units).
    const dash = `${formatNumber(2 * mpmm)},${formatNumber(1.5 * mpmm)}`;
    parts.push(
      pathToSvg(pathData, "none", palette.ink, getLineweight("light", scale, unit), dash)
    );
  } else if (barrierType === "gate") {
    // Light broken line (long dash / long gap).
    const dash = `${formatNumber(4 * mpmm)},${formatNumber(3 * mpmm)}`;
    parts.push(
      pathToSvg(pathData, "none", palette.ink, getLineweight("light", scale, unit), dash)
    );
  } else {
    // fence (default): medium line + periodic perpendicular tick posts.
    parts.push(
      pathToSvg(pathData, "none", palette.ink, getLineweight("medium", scale, unit))
    );

    // Total path length in model units.
    let totalLen = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1][0] - path[i][0];
      const dy = path[i + 1][1] - path[i][1];
      totalLen += Math.sqrt(dx * dx + dy * dy);
    }

    // Posts every ~6 paper-mm, tick half-length ~1.5 paper-mm, so the fence
    // reads as a distinct barrier rather than a faint hairline.
    const spacing = 6 * mpmm;
    const tickHalf = 1.5 * mpmm;
    if (totalLen > 0 && spacing > 0) {
      const nPosts = Math.floor(totalLen / spacing);
      for (let k = 0; k <= nPosts; k++) {
        const t = (k * spacing) / totalLen;
        const p = getPointAlongPath(path, t);
        const dir = getPathDirection(path, t);
        const perp = [-dir[1], dir[0]];
        parts.push(
          lineToSvg(
            p[0] - tickHalf * perp[0],
            p[1] - tickHalf * perp[1],
            p[0] + tickHalf * perp[0],
            p[1] + tickHalf * perp[1],
            palette.ink,
            getLineweight("light", scale, unit)
          )
        );
      }
    }
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Render north arrow (circle with N and directional pointer)
 */
export function renderNorthArrow(
  x: number,
  y: number,
  size: number,
  northAngle: number,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const parts: string[] = ['<g id="north-arrow" transform="translate(' + formatNumber(x) + ',' + formatNumber(y) + ') rotate(' + formatNumber(northAngle) + ')">'];

  // Outer circle
  const circle = circleToSvg(0, 0, size / 2, "none", palette.ink, getLineweight("fine", "1:50", "m"));
  parts.push(circle);

  // Arrow pointing up (north)
  const arrowHeight = size * 0.6;
  const arrowWidth = size * 0.3;
  const arrow = `<polygon points="0,-${formatNumber(arrowHeight / 2)} ${formatNumber(arrowWidth / 2)},0 0,${formatNumber(arrowHeight / 2)} ${formatNumber(-arrowWidth / 2)},0" fill="${palette.ink}" />`;
  parts.push(arrow);

  // N label
  const nLabel = textToSvg("N", 0, size * 0.1, size * 0.3, palette.ink, "middle");
  parts.push(nLabel);

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Render scale bar (horizontal bar with tick marks and labels)
 */
export function renderScaleBar(
  x: number,
  y: number,
  lengthModelUnits: number,
  scale: string,
  unit: Unit,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);
  const stops = getScaleBarStops(scale, unit, lengthModelUnits);

  const parts: string[] = [
    '<g id="scale-bar">',
  ];

  // Draw main bar line
  const barLine = lineToSvg(
    x,
    y,
    x + lengthModelUnits,
    y,
    palette.ink,
    getLineweight("fine", scale, unit)
  );
  parts.push(barLine);

  // Draw ticks and labels
  for (const stop of stops) {
    const tickX = x + stop.positionMm * mpmm;

    // Tick mark
    const tick = lineToSvg(
      tickX,
      y,
      tickX,
      y + 2 * mpmm,
      palette.ink,
      getLineweight("fine", scale, unit)
    );
    parts.push(tick);

    // Label
    const labelY = y + 4.5 * mpmm;
    const label = textToSvg(stop.label, tickX, labelY, 2.5 * mpmm, palette.ink, "middle");
    parts.push(label);
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Render grid bubble (circle with letter/number label)
 * Label text is scaled according to the drawing's actual scale, not hardcoded
 */
export function renderGridBubble(
  x: number,
  y: number,
  label: string,
  radiusMm: number,
  theme: Theme,
  scale: string,
  unit: Unit
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);
  const radiusModel = radiusMm * mpmm;

  const parts: string[] = ['<g id="grid-bubble">'];

  // Circle
  const circle = circleToSvg(
    x,
    y,
    radiusModel,
    "none",
    palette.ink,
    getLineweight("fine", scale, unit)
  );
  parts.push(circle);

  // Label (paper-mm text, scaled to drawing's scale)
  const labelText = textToSvg(escapeXml(label), x, y + radiusModel * 0.35, 2.5 * mpmm, palette.ink, "middle");
  parts.push(labelText);

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Render a dimension string (line with ticks and label)
 * Text and line weights are scaled according to the drawing's actual scale
 */
export function renderDimensionString(
  from: Coordinate,
  to: Coordinate,
  offsetUnits: number,
  unit: Unit,
  theme: Theme,
  scale: string,
  textOverride?: string
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);

  // Calculate distance
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const distance = Math.sqrt(dx * dx + dy * dy);

  const parts: string[] = ['<g id="dimension">'];

  // Extension lines (offset perpendicular)
  const normLen = Math.sqrt(dx * dx + dy * dy);
  if (normLen > 0) {
    const normX = dx / normLen;
    const normY = dy / normLen;
    // Perpendicular
    const perpX = -normY;
    const perpY = normX;

    const offsetX = perpX * offsetUnits;
    const offsetY = perpY * offsetUnits;

    // Extension line from 'from'
    const ext1 = lineToSvg(
      from[0],
      from[1],
      from[0] + offsetX,
      from[1] + offsetY,
      palette.ink,
      getLineweight("fine", scale, unit)
    );
    parts.push(ext1);

    // Extension line from 'to'
    const ext2 = lineToSvg(
      to[0],
      to[1],
      to[0] + offsetX,
      to[1] + offsetY,
      palette.ink,
      getLineweight("fine", scale, unit)
    );
    parts.push(ext2);

    // Dimension line (with ticks)
    const dimFromX = from[0] + offsetX;
    const dimFromY = from[1] + offsetY;
    const dimToX = to[0] + offsetX;
    const dimToY = to[1] + offsetY;

    const dimLine = lineToSvg(
      dimFromX,
      dimFromY,
      dimToX,
      dimToY,
      palette.ink,
      getLineweight("fine", scale, unit)
    );
    parts.push(dimLine);

    // Dimension text: real-unit measure, or an author-supplied override.
    const text = textOverride ?? formatDimensionValue(distance, unit);
    const midX = (dimFromX + dimToX) / 2;
    const midY = (dimFromY + dimToY) / 2 - 1 * mpmm;

    const dimText = textToSvg(text, midX, midY, 2.5 * mpmm, palette.ink, "middle");
    parts.push(dimText);
  }

  parts.push("</g>");
  return parts.join("\n");
}
