/**
 * primitives.ts — Analytic geometry using @flatten-js/core
 * Provides bbox, centroid, point-along-path, perpendicular offsets, and door-arc construction
 */

import * as Flatten from "@flatten-js/core";

export type Coordinate = [number, number];
export type Polygon = Coordinate[];
export type Path = Coordinate[];

export interface BboxResult {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Compute the bounding box of one or more polygons
 */
export function getBbox(polygons: Polygon[]): BboxResult {
  if (polygons.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const polygon of polygons) {
    for (const [x, y] of polygon) {
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Compute the area of a closed polygon
 * Positive area = CCW orientation, negative = CW
 */
export function getPolygonArea(polygon: Polygon): number {
  if (polygon.length < 3) return 0;

  // Shoelace formula
  let area = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % polygon.length];
    area += x1 * y2 - x2 * y1;
  }

  return Math.abs(area) / 2;
}

/**
 * Compute the centroid (center of mass) of a polygon
 */
export function getCentroid(polygon: Polygon): Coordinate {
  if (polygon.length === 0) {
    return [0, 0];
  }

  let cx = 0;
  let cy = 0;

  for (const [x, y] of polygon) {
    cx += x;
    cy += y;
  }

  return [cx / polygon.length, cy / polygon.length];
}

/**
 * Get a point along a path (polyline) at parameter t ∈ [0, 1]
 * t=0 is the start, t=1 is the end
 */
export function getPointAlongPath(path: Path, t: number): Coordinate {
  if (path.length === 0) {
    return [0, 0];
  }

  if (path.length === 1) {
    return [...path[0]];
  }

  // Clamp t to [0, 1]
  const clamped = Math.max(0, Math.min(1, t));

  // Compute total path length
  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    totalLength += length;
  }

  if (totalLength === 0) {
    return [...path[0]];
  }

  // Find which segment t falls into
  const targetLength = clamped * totalLength;
  let currentLength = 0;

  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i];
    if (currentLength + segmentLength >= targetLength) {
      // t falls in this segment
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];

      if (segmentLength === 0) {
        return [x1, y1];
      }

      const segmentT = (targetLength - currentLength) / segmentLength;
      return [x1 + segmentT * (x2 - x1), y1 + segmentT * (y2 - y1)];
    }

    currentLength += segmentLength;
  }

  // Shouldn't reach here, but return end as fallback
  return [...path[path.length - 1]];
}

/**
 * Get the unit tangent (direction) of a path at a given position ∈ [0, 1].
 * Returns a unit vector along the segment containing that position.
 */
export function getPathDirection(
  path: Path,
  positionAlongPath: number
): Coordinate {
  const clamped = Math.max(0, Math.min(1, positionAlongPath));

  let totalLength = 0;
  const segmentLengths: number[] = [];
  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    segmentLengths.push(Math.sqrt(dx * dx + dy * dy));
    totalLength += segmentLengths[i];
  }

  const targetLength = clamped * totalLength;
  let currentLength = 0;
  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i];
    if (currentLength + segmentLength >= targetLength) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) return [dx / len, dy / len];
      break;
    }
    currentLength += segmentLength;
  }

  return [1, 0];
}

/**
 * Get a point perpendicular to a path at a given position along the path
 * @param path The centerline path
 * @param positionAlongPath Position along path [0, 1]
 * @param offset Perpendicular offset distance (positive = left, negative = right)
 * @returns Perpendicular point
 */
export function getPerpendicular(
  path: Path,
  positionAlongPath: number,
  offset: number
): Coordinate {
  const point = getPointAlongPath(path, positionAlongPath);

  // Find the direction at this point
  // Use the segment that contains this point
  const clamped = Math.max(0, Math.min(1, positionAlongPath));

  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < path.length - 1; i++) {
    const [x1, y1] = path[i];
    const [x2, y2] = path[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    totalLength += length;
  }

  const targetLength = clamped * totalLength;
  let currentLength = 0;
  let segmentDirection = [1, 0]; // Default direction

  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i];
    if (currentLength + segmentLength >= targetLength) {
      const [x1, y1] = path[i];
      const [x2, y2] = path[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        segmentDirection = [dx / len, dy / len];
      }
      break;
    }
    currentLength += segmentLength;
  }

  // Perpendicular is 90° rotation: (dx, dy) → (-dy, dx)
  const [dx, dy] = segmentDirection;
  const perpDir = [-dy, dx];

  return [
    point[0] + offset * perpDir[0],
    point[1] + offset * perpDir[1],
  ];
}

/**
 * Generate a door-swing arc
 * @param wallPath The wall centerline path
 * @param positionAlongWall Position along wall [0, 1]
 * @param doorWidth Width of the door
 * @param hingeAtStart If true, hinge is at the start of the door; if false, at the end
 * @param swingRight If true, door swings to the right; if false, to the left
 * @returns Array of points approximating the 90° swing arc
 */
export function getDoorcSwingArc(
  wallPath: Path,
  positionAlongWall: number,
  doorWidth: number,
  hingeAtStart: boolean,
  swingRight: boolean
): Coordinate[] {
  // Get the point along the wall
  const wallPoint = getPointAlongPath(wallPath, positionAlongWall);

  // Find the wall direction at this point
  const clamped = Math.max(0, Math.min(1, positionAlongWall));

  let totalLength = 0;
  const segmentLengths: number[] = [];

  for (let i = 0; i < wallPath.length - 1; i++) {
    const [x1, y1] = wallPath[i];
    const [x2, y2] = wallPath[i + 1];
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    segmentLengths.push(length);
    totalLength += length;
  }

  const targetLength = clamped * totalLength;
  let currentLength = 0;
  let wallDir = [1, 0]; // Default direction

  for (let i = 0; i < segmentLengths.length; i++) {
    const segmentLength = segmentLengths[i];
    if (currentLength + segmentLength >= targetLength) {
      const [x1, y1] = wallPath[i];
      const [x2, y2] = wallPath[i + 1];
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.sqrt(dx * dx + dy * dy);

      if (len > 0) {
        wallDir = [dx / len, dy / len];
      }
      break;
    }
    currentLength += segmentLength;
  }

  // Perpendicular to wall
  const perpDir = [-wallDir[1], wallDir[0]];

  // The opening gap is centered on wallPoint and spans ±doorWidth/2 along the
  // wall. The hinge must sit on one jamb (an edge of the gap), not the center,
  // so the leaf and swing arc align with the cut gap. The closed leaf then
  // reaches the opposite jamb, exactly spanning the opening.
  const half = doorWidth / 2;
  let hingePoint: Coordinate;
  let leafDir: number[]; // unit direction from hinge toward the opposite jamb

  if (hingeAtStart) {
    hingePoint = [
      wallPoint[0] - half * wallDir[0],
      wallPoint[1] - half * wallDir[1],
    ];
    leafDir = [wallDir[0], wallDir[1]];
  } else {
    hingePoint = [
      wallPoint[0] + half * wallDir[0],
      wallPoint[1] + half * wallDir[1],
    ];
    leafDir = [-wallDir[0], -wallDir[1]];
  }

  // Generate the quarter-circle arc, radius = doorWidth (leaf length), swept
  // from the closed leaf (angle 0, pointing along leafDir to the opposite
  // jamb) to the fully open leaf (angle 90°, perpendicular to the wall on the
  // swing side). The hinge itself is NOT part of the arc — including it would
  // draw a spurious straight radius segment from the hinge to the closed jamb.
  // The caller draws the single leaf line (hinge → open tip); the arc closes
  // the 90° swing, so leaf ⟂ wall reads as a clean right angle.
  const arcPoints: Coordinate[] = [];
  const swingDirection = swingRight ? 1 : -1;
  const numArcPoints = 24; // Approximate arc with line segments

  for (let i = 0; i < numArcPoints; i++) {
    const angle = (i / (numArcPoints - 1)) * (Math.PI / 2); // 0° to 90°
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);

    const x =
      hingePoint[0] +
      doorWidth * (cos * leafDir[0] + swingDirection * sin * perpDir[0]);
    const y =
      hingePoint[1] +
      doorWidth * (cos * leafDir[1] + swingDirection * sin * perpDir[1]);

    arcPoints.push([x, y]);
  }

  // Return hinge as the first element so the caller has the pivot, followed by
  // the arc from closed jamb to open tip.
  return [hingePoint, ...arcPoints];
}
