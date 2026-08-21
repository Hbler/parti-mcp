import * as turf from "@turf/turf";
import type { Opening } from "../schema.js";

export type Coordinates = [number, number];

export interface Point {
  x: number;
  y: number;
}

export interface CutWallResult {
  /**
   * The wall after openings have been cut. A through-gap can split a single
   * wall into two disjoint polygons, so this is an array of polygons; each
   * polygon is itself an array of rings (outer ring first).
   */
  wallPolygons: Coordinates[][][];
  markers: string[];
}

/**
 * Compute a point along a path at a given fraction (0-1)
 * @param path Array of coordinates forming a polyline
 * @param fractionAlong Fraction along the path (0=start, 1=end)
 * @returns Point at that fraction
 */
export function computePointAlongPath(
  path: Coordinates[],
  fractionAlong: number
): Point {
  if (path.length < 2) {
    throw new Error("Path must have at least 2 points");
  }

  // Clamp fraction to [0, 1]
  const fraction = Math.max(0, Math.min(1, fractionAlong));

  // Compute total path length
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(distance);
    totalLength += distance;
  }

  // Handle zero-length path
  if (totalLength === 0) {
    return { x: path[0][0], y: path[0][1] };
  }

  // Find target distance
  const targetDistance = totalLength * fraction;

  // Find segment containing the target distance
  let cumulativeDistance = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i];
    if (cumulativeDistance + segmentLength >= targetDistance) {
      // Target is in this segment
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];

      // How far along this segment?
      const segmentFraction =
        segmentLength > 0
          ? (targetDistance - cumulativeDistance) / segmentLength
          : 0;

      // Interpolate
      const x = x1 + (x2 - x1) * segmentFraction;
      const y = y1 + (y2 - y1) * segmentFraction;

      return { x, y };
    }
    cumulativeDistance += segmentLength;
  }

  // Shouldn't reach here, but return end point as fallback
  return { x: path[path.length - 1][0], y: path[path.length - 1][1] };
}

/**
 * Compute the angle of a wall's primary direction
 * @param wallPath Array of coordinates forming the wall centerline
 * @returns Angle in degrees (-180 to 180)
 */
export function computeWallAngle(wallPath: Coordinates[]): number {
  if (wallPath.length < 2) {
    throw new Error("Wall path must have at least 2 points");
  }

  const [x1, y1] = wallPath[0];
  const [x2, y2] = wallPath[wallPath.length - 1];

  const dx = x2 - x1;
  const dy = y2 - y1;

  // Compute angle in radians using atan2, then convert to degrees
  const radians = Math.atan2(dy, dx);
  let degrees = (radians * 180) / Math.PI;

  // Normalize to [-180, 180]
  if (degrees > 180) {
    degrees -= 360;
  } else if (degrees < -180) {
    degrees += 360;
  }

  return degrees;
}

/**
 * Compute perpendicular offset vector for a given wall angle
 * @param angle Wall angle in degrees
 * @param distance Offset distance
 * @returns [dx, dy] perpendicular offset components
 */
export function computePerpendicularOffset(
  angle: number,
  distance: number
): [number, number] {
  // Perpendicular angle = angle + 90 degrees
  const perpAngleDegrees = angle + 90;
  const perpAngleRadians = (perpAngleDegrees * Math.PI) / 180;

  const dx = distance * Math.cos(perpAngleRadians);
  const dy = distance * Math.sin(perpAngleRadians);

  return [dx, dy];
}

/**
 * Generate an SVG door marker: the leaf line across the opening plus a
 * quarter-circle swing arc. Sizes are in world units (radius = opening width).
 */
function generateDoorMarker(
  center: Point,
  dir: [number, number],
  perp: [number, number],
  width: number,
  stroke: number
): string {
  const half = width / 2;
  // Hinge at one jamb, closed-leaf tip at the other jamb.
  const hingeX = center.x - dir[0] * half;
  const hingeY = center.y - dir[1] * half;
  const leafX = center.x + dir[0] * half;
  const leafY = center.y + dir[1] * half;
  // Swept-open leaf tip: hinge + perpendicular * width (quarter turn).
  const openX = hingeX + perp[0] * width;
  const openY = hingeY + perp[1] * width;

  return (
    `<path d="M${hingeX},${hingeY} L${leafX},${leafY} ` +
    `M${hingeX},${hingeY} A${width},${width} 0 0,1 ${openX},${openY}" ` +
    `stroke="black" stroke-width="${stroke}" fill="none" />`
  );
}

/**
 * Generate an SVG window marker: a short double line spanning the opening,
 * perpendicular offsets in world units.
 */
function generateWindowMarker(
  center: Point,
  dir: [number, number],
  perp: [number, number],
  width: number,
  stroke: number
): string {
  const half = width / 2;
  // Line endpoints run along the wall direction across the opening.
  const ax = center.x - dir[0] * half;
  const ay = center.y - dir[1] * half;
  const bx = center.x + dir[0] * half;
  const by = center.y + dir[1] * half;
  // Two parallel lines offset slightly to each side (perpendicular).
  const off = Math.max(width * 0.15, stroke);
  const o = [perp[0] * off, perp[1] * off];

  return (
    `<line x1="${ax + o[0]}" y1="${ay + o[1]}" x2="${bx + o[0]}" y2="${by + o[1]}" stroke="black" stroke-width="${stroke}" />` +
    `<line x1="${ax - o[0]}" y1="${ay - o[1]}" x2="${bx - o[0]}" y2="${by - o[1]}" stroke="black" stroke-width="${stroke}" />`
  );
}

/** Close a ring (append the first point if it isn't already the last). */
function closeRing(ring: Coordinates[]): Coordinates[] {
  if (ring.length === 0) return ring;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (fx === lx && fy === ly) return ring;
  return [...ring, [fx, fy]];
}

/** Diagonal of a polygon's bounding box (used to size a through-cutter). */
function bboxDiagonal(polygon: Coordinates[][]): number {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const ring of polygon) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return 0;
  const w = maxX - minX;
  const h = maxY - minY;
  return Math.sqrt(w * w + h * h);
}

/** Extract a flat list of polygons (each = rings) from a turf geometry. */
function extractPolygons(
  geom: { type: string; coordinates: unknown }
): Coordinates[][][] {
  if (geom.type === "Polygon") {
    return [geom.coordinates as Coordinates[][]];
  }
  if (geom.type === "MultiPolygon") {
    return (geom.coordinates as Coordinates[][][]).slice();
  }
  return [];
}

/**
 * Build a rectangular cutter centered on the opening: `opening.width` long
 * along the wall direction, and `depth` deep perpendicular to it (deep enough
 * to cross the whole wall so the subtraction produces a real through-gap).
 */
function buildCutter(
  center: Point,
  dir: [number, number],
  perp: [number, number],
  width: number,
  depth: number
): Coordinates[] {
  const hl = width / 2;
  const hd = depth / 2;
  const corners: Coordinates[] = [
    [center.x + dir[0] * hl + perp[0] * hd, center.y + dir[1] * hl + perp[1] * hd],
    [center.x + dir[0] * hl - perp[0] * hd, center.y + dir[1] * hl - perp[1] * hd],
    [center.x - dir[0] * hl - perp[0] * hd, center.y - dir[1] * hl - perp[1] * hd],
    [center.x - dir[0] * hl + perp[0] * hd, center.y - dir[1] * hl + perp[1] * hd],
  ];
  return closeRing(corners);
}

/**
 * Cut one or more openings into a buffered wall polygon. Each opening is a real
 * gap subtracted from the wall (planar `turf.difference`); a mid-wall opening
 * splits the wall into two polygons. Returns all resulting polygons plus a
 * door/window marker per opening. Pure: does not mutate inputs.
 *
 * @param wallPolygon Buffered wall polygon (array of rings, outer first)
 * @param wallPath Original wall centerline
 * @param openings Openings to cut into this wall
 */
export function cutWallOpenings(
  wallPolygon: Coordinates[][],
  wallPath: Coordinates[],
  openings: Opening[]
): CutWallResult {
  const markers: string[] = [];
  // Depth of the cutter: comfortably larger than the wall so it cuts through.
  const depth = Math.max(bboxDiagonal(wallPolygon) * 2, 1);

  let pieces: Coordinates[][][] = [wallPolygon.map(closeRing)];

  for (const opening of openings) {
    const center = computePointAlongPath(wallPath, opening.positionAlongWall);
    const angle = computeWallAngle(wallPath);
    const rad = (angle * Math.PI) / 180;
    const dir: [number, number] = [Math.cos(rad), Math.sin(rad)];
    // Perpendicular (angle + 90°).
    const perp: [number, number] = [-Math.sin(rad), Math.cos(rad)];

    const cutterRing = buildCutter(center, dir, perp, opening.width, depth);
    const cutter = turf.polygon([cutterRing as unknown as number[][]]);

    const next: Coordinates[][][] = [];
    for (const piece of pieces) {
      try {
        const pieceFeature = turf.polygon(piece as unknown as number[][][]);
        const diff = turf.difference(
          turf.featureCollection([pieceFeature, cutter])
        );
        if (!diff) {
          // Cutter fully removed this piece — drop it (leaves a real gap).
          continue;
        }
        next.push(...extractPolygons(diff.geometry as { type: string; coordinates: unknown }));
      } catch {
        // If the boolean op fails on a degenerate piece, keep it uncut rather
        // than dropping the wall entirely.
        next.push(piece);
      }
    }
    pieces = next;

    // Marker sizing is in world units so it stays proportional to the opening.
    const stroke = Math.max(opening.width * 0.12, 0.08);
    if (opening.type === "door") {
      markers.push(generateDoorMarker(center, dir, perp, opening.width, stroke));
    } else {
      markers.push(generateWindowMarker(center, dir, perp, opening.width, stroke));
    }
  }

  return { wallPolygons: pieces, markers };
}

/**
 * Convenience wrapper: cut a single opening into a wall.
 */
export function cutWallOpening(
  wallPolygon: Coordinates[][],
  wallPath: Coordinates[],
  opening: Opening
): CutWallResult {
  return cutWallOpenings(wallPolygon, wallPath, [opening]);
}
