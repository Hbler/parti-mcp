import type { Opening } from "../schema.js";

export type Coordinates = [number, number];

export interface Point {
  x: number;
  y: number;
}

export interface CutWallResult {
  wallPolygon: Coordinates[][];
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
 * Generate SVG marker string for a door
 * @param cx Center x coordinate
 * @param cy Center y coordinate
 * @param angle Wall angle in degrees
 * @param radius Radius of the door arc
 * @returns SVG path element as string
 */
function generateDoorMarker(
  cx: number,
  cy: number,
  angle: number,
  radius: number
): string {
  // Convert wall angle to radians
  const angleRad = (angle * Math.PI) / 180;

  // Door arc: quarter circle at the wall position, rotated by wall angle
  // Start point: perpendicular to wall, distance = radius
  const [dx, dy] = computePerpendicularOffset(angle, radius);

  const x1 = cx;
  const y1 = cy;
  const x2 = cx + dx;
  const y2 = cy + dy;

  // SVG arc path: quarter circle
  // M (move to start), A (arc)
  // A rx ry x-axis-rotation large-arc-flag sweep-flag x y
  const arcPath = `<path d="M${x1},${y1} A${radius},${radius} 0 0,1 ${x2},${y2}" stroke="black" stroke-width="2" fill="none" />`;

  return arcPath;
}

/**
 * Generate SVG marker string for a window
 * @param cx Center x coordinate
 * @param cy Center y coordinate
 * @param angle Wall angle in degrees
 * @param width Window width
 * @returns SVG lines element as string
 */
function generateWindowMarker(
  cx: number,
  cy: number,
  angle: number,
  width: number
): string {
  // Window: two small lines perpendicular to wall, centered on opening
  const halfWidth = width / 2;

  // Perpendicular offsets for window lines
  const [dx1, dy1] = computePerpendicularOffset(angle, halfWidth);
  const [dx2, dy2] = computePerpendicularOffset(angle, -halfWidth);

  // First line
  const x1a = cx + dx1;
  const y1a = cy + dy1;
  const x1b = cx + dx2;
  const y1b = cy + dy2;

  // Second line (offset slightly along the wall)
  // Direction along wall (perpendicular to angle)
  const wallAngleRad = (angle * Math.PI) / 180;
  const alongWallDx = Math.cos(wallAngleRad) * 0.2;
  const alongWallDy = Math.sin(wallAngleRad) * 0.2;

  const x2a = x1a + alongWallDx;
  const y2a = y1a + alongWallDy;
  const x2b = x1b + alongWallDx;
  const y2b = y1b + alongWallDy;

  return `<line x1="${x1a}" y1="${y1a}" x2="${x1b}" y2="${y1b}" stroke="black" stroke-width="1" /><line x1="${x2a}" y1="${y2a}" x2="${x2b}" y2="${y2b}" stroke="black" stroke-width="1" />`;
}

/**
 * Cut a gap in a wall for an opening and generate markers
 * @param wallPolygon Buffered wall polygon (outer ring)
 * @param wallPath Original wall centerline
 * @param opening Opening (door or window)
 * @param scale Pixels per unit (for marker sizing)
 * @returns Result with modified polygon and markers
 *
 * NOTE: For v1, we don't actually cut the polygon (complex operation).
 * We just return the original polygon and generate markers.
 */
export function cutWallOpening(
  wallPolygon: Coordinates[][],
  wallPath: Coordinates[],
  opening: Opening,
  scale: number
): CutWallResult {
  // Compute position along wall
  const posPoint = computePointAlongPath(wallPath, opening.positionAlongWall);

  // Compute wall angle
  const angle = computeWallAngle(wallPath);

  // Generate marker based on opening type
  let marker = "";
  const markerRadius = Math.max(0.1, opening.width / 2);

  if (opening.type === "door") {
    marker = generateDoorMarker(posPoint.x, posPoint.y, angle, markerRadius);
  } else if (opening.type === "window") {
    marker = generateWindowMarker(posPoint.x, posPoint.y, angle, opening.width);
  } else {
    // Default to window-style marker for unknown types
    marker = generateWindowMarker(posPoint.x, posPoint.y, angle, opening.width);
  }

  // For v1: Return original polygon (don't cut gap)
  // Just return the markers for visualization
  return {
    wallPolygon,
    markers: [marker],
  };
}
