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
 * Tessellate a circular arc through two endpoints into a dense polyline.
 *
 * Given `from`, `to`, and a `radius`, there are two candidate circle centers
 * (mirror images across the chord); `clockwise` selects which side the arc
 * bulges toward (i.e. the direction of travel from `from` to `to`). The arc is
 * the *minor* arc for the chosen center. The number of segments is bounded by
 * an arc tolerance so the flattened arc never deviates from the true arc by
 * more than ~`tolerance` model units.
 *
 * Returns a polyline [from, ..., to]. Falls back to the straight chord if the
 * radius is too small to span the endpoints (radius < half chord).
 */
export function tessellateArc(
  from: Coordinate,
  to: Coordinate,
  radius: number,
  clockwise: boolean,
  tolerance = 0.02
): Coordinate[] {
  const mx = (from[0] + to[0]) / 2;
  const my = (from[1] + to[1]) / 2;
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const chord = Math.sqrt(dx * dx + dy * dy);

  // Degenerate / impossible radius → straight chord.
  if (chord === 0 || radius < chord / 2) {
    return [from, to];
  }

  // Distance from chord midpoint to the circle center.
  const h = Math.sqrt(Math.max(0, radius * radius - (chord / 2) * (chord / 2)));
  // Unit normal to the chord.
  const nx = -dy / chord;
  const ny = dx / chord;
  // Two centers: pick side by `clockwise`.
  const sign = clockwise ? 1 : -1;
  const cx = mx + sign * h * nx;
  const cy = my + sign * h * ny;

  // Angles of the endpoints about the center.
  const a0 = Math.atan2(from[1] - cy, from[0] - cx);
  const a1 = Math.atan2(to[1] - cy, to[0] - cx);
  // Always sweep the MINOR arc (shortest way, |sweep| ≤ π). Which side the arc
  // bulges toward is already fixed by the center chosen via `clockwise` above;
  // the sweep direction must not also depend on `clockwise`, or it selects the
  // reflex (major) arc and the wall wraps almost all the way around the circle.
  let sweep = a1 - a0;
  while (sweep > Math.PI) sweep -= 2 * Math.PI;
  while (sweep < -Math.PI) sweep += 2 * Math.PI;

  // Segment count from arc tolerance: max angular step where sagitta ≤ tol.
  // sagitta = r(1 - cos(step/2)) ≤ tol  →  step ≤ 2*acos(1 - tol/r).
  const maxStep = 2 * Math.acos(Math.max(-1, Math.min(1, 1 - tolerance / radius)));
  const segments = Math.max(2, Math.ceil(Math.abs(sweep) / Math.max(1e-6, maxStep)));

  const pts: Coordinate[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + (sweep * i) / segments;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  // Pin exact endpoints (avoid float drift so wall junctions stay coincident).
  pts[0] = [from[0], from[1]];
  pts[pts.length - 1] = [to[0], to[1]];
  return pts;
}

/**
 * A curve applied to a closed footprint polygon. Structural type (mirrors the
 * FootprintCurve schema) so geometry stays free of schema imports.
 */
export interface FootprintCurveSpec {
  edge?: number;
  corner?: number;
  setbackIn?: number;
  setbackOut?: number;
  radius?: number;
  clockwise?: boolean;
}

function vsub(a: Coordinate, b: Coordinate): Coordinate {
  return [a[0] - b[0], a[1] - b[1]];
}
function vlen(a: Coordinate): number {
  return Math.sqrt(a[0] * a[0] + a[1] * a[1]);
}
function vunit(a: Coordinate): Coordinate {
  const l = vlen(a) || 1;
  return [a[0] / l, a[1] / l];
}

/**
 * Apply circular-arc curves to a closed footprint polygon, returning a new
 * (denser) polygon with the targeted edges/corners replaced by tessellated
 * arcs. Straight edges/corners are left untouched. All arcs go through the
 * shared `tessellateArc`. If a curve is degenerate/does not fit, that entry is
 * skipped (the sharp edge/corner is kept) rather than throwing.
 *
 * - edge bow: replace edge `i`→`i+1` with an arc (needs `radius`).
 * - corner round: replace vertex `i` with an arc between two setback points on
 *   the adjacent edges. Mode by field presence:
 *     radius only     → tangent fillet, setback d = radius / tan(theta/2)
 *     setbacks (± radius) → free arc through the two setback points
 */
export function resolveFootprint(
  footprint: Polygon,
  curves?: FootprintCurveSpec[]
): Polygon {
  if (!curves || curves.length === 0) return footprint;
  const n = footprint.length;
  const edgeCurve = new Map<number, FootprintCurveSpec>();
  const cornerCurve = new Map<number, FootprintCurveSpec>();
  for (const c of curves) {
    if (c.edge !== undefined) edgeCurve.set(((c.edge % n) + n) % n, c);
    else if (c.corner !== undefined) cornerCurve.set(((c.corner % n) + n) % n, c);
  }

  const out: Polygon = [];
  for (let i = 0; i < n; i++) {
    const prev = footprint[(i - 1 + n) % n];
    const cur = footprint[i];
    const next = footprint[(i + 1) % n];

    // Corner round at vertex i: emit the arc INSTEAD of the vertex.
    const cc = cornerCurve.get(i);
    if (cc) {
      const dirIn = vunit(vsub(cur, prev));   // toward the corner
      const dirOut = vunit(vsub(next, cur));  // away from the corner
      const inLen = vlen(vsub(cur, prev));
      const outLen = vlen(vsub(next, cur));

      let dIn = cc.setbackIn;
      let dOut = cc.setbackOut;
      if (dIn === undefined && dOut === undefined && cc.radius !== undefined) {
        // Tangent fillet: interior half-angle between the two edges.
        const cosTurn = Math.max(-1, Math.min(1, dirIn[0] * dirOut[0] + dirIn[1] * dirOut[1]));
        const turn = Math.acos(cosTurn);        // exterior turn angle
        const half = (Math.PI - turn) / 2;      // half interior angle
        const t = Math.tan(half);
        const d = t > 1e-6 ? cc.radius / t : 0;
        dIn = d;
        dOut = d;
      }
      dIn = Math.min(dIn ?? cc.setbackOut ?? 0, inLen * 0.999);
      dOut = Math.min(dOut ?? cc.setbackIn ?? 0, outLen * 0.999);

      if (dIn > 0 && dOut > 0) {
        const p1: Coordinate = [cur[0] - dirIn[0] * dIn, cur[1] - dirIn[1] * dIn];
        const p2: Coordinate = [cur[0] + dirOut[0] * dOut, cur[1] + dirOut[1] * dOut];
        // Radius: explicit, else derive from chord so the arc fits the corner.
        const chord = vlen(vsub(p2, p1));
        const radius = cc.radius ?? chord / 2 + 1e-9;
        // clockwise default: bulge toward the corner (convex round).
        const cw = cc.clockwise ?? true;
        const arc = tessellateArc(p1, p2, Math.max(radius, chord / 2), cw);
        out.push(...arc);
        continue;
      }
      // Fell through (degenerate) → keep the sharp vertex.
      out.push(cur);
    } else {
      out.push(cur);
    }

    // Edge bow on edge i→i+1: replace the straight hop to `next` with an arc.
    const ec = edgeCurve.get(i);
    if (ec && ec.radius !== undefined) {
      const arc = tessellateArc(cur, next, ec.radius, ec.clockwise ?? false);
      // arc includes both endpoints; we already pushed `cur`, and `next` will
      // be pushed by the next iteration — so add only the interior arc points.
      out.push(...arc.slice(1, arc.length - 1));
    }
  }
  return out;
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
