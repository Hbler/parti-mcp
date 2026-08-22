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
  polygonToSvg,
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


/**
 * Render a straight-run stair as the conventional plan symbol:
 *  - parallel tread lines perpendicular to the direction of travel
 *  - a centerline direction arrow from the bottom riser toward the top
 *  - an "UP"/"DN" text label near the bottom
 *  - a diagonal break line at the cut plane (flight midpoint); treads beyond
 *    the cut are dashed (they are overhead / above the cut)
 *
 * @param footprint the flight rectangle (polygon)
 * @param run       travel centerline [bottom, top] (bottom = lowest riser)
 * @param treads    number of treads
 * @param direction "up" (arrow toward top, label UP) | "down" (label DN)
 */
export function renderStair(
  footprint: Coordinate[],
  run: [Coordinate, Coordinate],
  treads: number,
  direction: "up" | "down",
  labelOverride: string | undefined,
  scale: string,
  unit: Unit,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);
  const parts: string[] = ['<g id="stair">'];

  const [bottom, top] = run;
  const dx = top[0] - bottom[0];
  const dy = top[1] - bottom[1];
  const runLen = Math.sqrt(dx * dx + dy * dy) || 1;
  const dir = [dx / runLen, dy / runLen]; // unit along travel (bottom→top)
  const perp = [-dir[1], dir[0]]; // unit across the flight

  // Half-width of the flight = max projection of footprint vertices onto perp,
  // measured from the run centerline (bottom point as origin).
  let crossHalf = 0;
  for (const [vx, vy] of footprint) {
    const proj = Math.abs((vx - bottom[0]) * perp[0] + (vy - bottom[1]) * perp[1]);
    crossHalf = Math.max(crossHalf, proj);
  }
  if (crossHalf === 0) crossHalf = runLen * 0.4; // degenerate fallback

  const lw = getLineweight("light", scale, unit);
  const fineLw = getLineweight("fine", scale, unit);
  const dash = `${formatNumber(1.5 * mpmm)},${formatNumber(1 * mpmm)}`;

  // Tread lines at i/treads along the run (interior risers).
  // "cut" at flight midpoint: treads past it are overhead → dashed.
  for (let i = 1; i < treads; i++) {
    const t = i / treads;
    const cx = bottom[0] + dir[0] * runLen * t;
    const cy = bottom[1] + dir[1] * runLen * t;
    const beyondCut = direction === "up" ? t > 0.5 : t < 0.5;
    parts.push(
      lineToSvg(
        cx - perp[0] * crossHalf,
        cy - perp[1] * crossHalf,
        cx + perp[0] * crossHalf,
        cy + perp[1] * crossHalf,
        palette.ink,
        lw,
        beyondCut ? dash : undefined
      )
    );
  }

  // Diagonal break line across the flight at the midpoint (a shallow zig-zag).
  {
    const mx = bottom[0] + dir[0] * runLen * 0.5;
    const my = bottom[1] + dir[1] * runLen * 0.5;
    const along = runLen * 0.06; // zig extent along travel
    const p1 = [mx - perp[0] * crossHalf - dir[0] * along, my - perp[1] * crossHalf - dir[1] * along];
    const zz = [mx + dir[0] * along, my + dir[1] * along];
    const p2 = [mx + perp[0] * crossHalf - dir[0] * along, my + perp[1] * crossHalf - dir[1] * along];
    parts.push(
      pathToSvg(polylineToSvg([p1 as Coordinate, zz as Coordinate, p2 as Coordinate]), "none", palette.ink, lw)
    );
  }

  // Direction arrow along the centerline. Arrow points toward the top for
  // "up", toward the bottom for "down".
  {
    const inset = runLen * 0.12;
    const tail = direction === "up"
      ? [bottom[0] + dir[0] * inset, bottom[1] + dir[1] * inset]
      : [top[0] - dir[0] * inset, top[1] - dir[1] * inset];
    const head = direction === "up"
      ? [top[0] - dir[0] * inset, top[1] - dir[1] * inset]
      : [bottom[0] + dir[0] * inset, bottom[1] + dir[1] * inset];
    parts.push(lineToSvg(tail[0], tail[1], head[0], head[1], palette.ink, fineLw));

    // Arrowhead at head.
    const adir = direction === "up" ? dir : [-dir[0], -dir[1]];
    const ah = 2.2 * mpmm; // arrowhead length
    const aw = 1.3 * mpmm; // arrowhead half-width
    const baseX = head[0] - adir[0] * ah;
    const baseY = head[1] - adir[1] * ah;
    parts.push(
      pathToSvg(
        polylineToSvg([
          [baseX + perp[0] * aw, baseY + perp[1] * aw] as Coordinate,
          head as Coordinate,
          [baseX - perp[0] * aw, baseY - perp[1] * aw] as Coordinate,
        ]),
        "none",
        palette.ink,
        fineLw
      )
    );

    // Label ("UP"/"DN") near the tail, offset to the side of the centerline.
    const label = labelOverride ?? (direction === "up" ? "UP" : "DN");
    const lox = tail[0] + perp[0] * (crossHalf + 1.5 * mpmm);
    const loy = tail[1] + perp[1] * (crossHalf + 1.5 * mpmm);
    parts.push(textToSvg(label, lox, loy, 2.5 * mpmm, palette.ink, "middle"));
  }

  parts.push("</g>");
  return parts.join("\n");
}

/**
 * Render a ladder as a schematic top view: two parallel rails along `path`
 * with short perpendicular rungs at regular intervals. No cut/break line.
 */
export function renderLadder(
  path: [Coordinate, Coordinate],
  width: number,
  scale: string,
  unit: Unit,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);
  const parts: string[] = ['<g id="ladder">'];

  const [a, b] = path;
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const dir = [dx / len, dy / len];
  const perp = [-dir[1], dir[0]];
  const half = width / 2;
  const lw = getLineweight("light", scale, unit);
  const fineLw = getLineweight("fine", scale, unit);

  // Two rails.
  for (const s of [1, -1]) {
    parts.push(
      lineToSvg(
        a[0] + perp[0] * half * s,
        a[1] + perp[1] * half * s,
        b[0] + perp[0] * half * s,
        b[1] + perp[1] * half * s,
        palette.ink,
        lw
      )
    );
  }

  // Rungs every ~4 paper-mm.
  const spacing = 4 * mpmm;
  const nRungs = Math.max(1, Math.floor(len / spacing));
  for (let i = 0; i <= nRungs; i++) {
    const t = nRungs === 0 ? 0 : i / nRungs;
    const cx = a[0] + dir[0] * len * t;
    const cy = a[1] + dir[1] * len * t;
    parts.push(
      lineToSvg(
        cx + perp[0] * half,
        cy + perp[1] * half,
        cx - perp[0] * half,
        cy - perp[1] * half,
        palette.ink,
        fineLw
      )
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}


/**
 * Render a column / pier / isolated masonry pad as its plan footprint filled
 * with poché or a material hatch, heavy outline. `fill` is pre-resolved by the
 * caller (a material-hatch url(#...) or a solid poché color).
 *  - square:      size × size, centered on position
 *  - rectangular: width × depth, centered
 *  - round:       diameter = size, centered
 */
export function renderColumn(
  position: Coordinate,
  shape: "square" | "rectangular" | "round",
  dims: { size?: number; width?: number; depth?: number },
  fill: string,
  scale: string,
  unit: Unit,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const lw = getLineweight("heavy", scale, unit);
  const [cx, cy] = position;
  const parts: string[] = ['<g id="column">'];

  if (shape === "round") {
    const r = (dims.size ?? 0.3) / 2;
    parts.push(circleToSvg(cx, cy, r, fill, palette.ink, lw));
  } else {
    const w = shape === "rectangular" ? dims.width ?? 0.3 : dims.size ?? 0.3;
    const d = shape === "rectangular" ? dims.depth ?? 0.3 : dims.size ?? 0.3;
    const hw = w / 2;
    const hd = d / 2;
    const rectPath = [
      [cx - hw, cy - hd],
      [cx + hw, cy - hd],
      [cx + hw, cy + hd],
      [cx - hw, cy + hd],
      [cx - hw, cy - hd],
    ] as Coordinate[];
    parts.push(pathToSvg(polylineToSvg(rectPath) + " Z", fill, palette.ink, lw));
  }

  parts.push("</g>");
  return parts.join("\n");
}


/**
 * Render an elevator as the standard plan symbol: the shaft rectangle
 * (footprint), an inset car rectangle, and an X (both diagonals) across the
 * shaft. Fine lineweight, no poché. Optional label (e.g. "ELEV").
 */
export function renderElevator(
  footprint: Coordinate[],
  label: string | undefined,
  scale: string,
  unit: Unit,
  theme: Theme
): string {
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(scale, unit);
  const parts: string[] = ['<g id="elevator">'];

  // Shaft bounding rectangle.
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of footprint) {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  const lw = getLineweight("light", scale, unit);
  const fineLw = getLineweight("fine", scale, unit);

  // Shaft outline.
  parts.push(
    pathToSvg(polygonToSvg([[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]]), "none", palette.ink, lw)
  );

  // Inset car rectangle.
  const inset = Math.min((maxX - minX), (maxY - minY)) * 0.12;
  parts.push(
    pathToSvg(
      polygonToSvg([
        [minX + inset, minY + inset],
        [maxX - inset, minY + inset],
        [maxX - inset, maxY - inset],
        [minX + inset, maxY - inset],
      ]),
      "none",
      palette.ink,
      fineLw
    )
  );

  // X diagonals across the shaft.
  parts.push(lineToSvg(minX, minY, maxX, maxY, palette.ink, fineLw));
  parts.push(lineToSvg(minX, maxY, maxX, minY, palette.ink, fineLw));

  // Optional label near the top of the shaft.
  if (label) {
    parts.push(
      textToSvg(label, (minX + maxX) / 2, minY - 1 * mpmm, 2 * mpmm, palette.ink, "middle")
    );
  }

  parts.push("</g>");
  return parts.join("\n");
}
