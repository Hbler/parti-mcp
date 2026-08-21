import * as turf from "@turf/turf";

// Export interfaces for use in render and tests
export interface PolygonEntity {
  polygon: number[][][]; // Coordinates[][]
  style?: any;
}

export interface LinearEntity {
  path: number[][]; // Coordinates[]
  width: number;
  style?: any;
}

export interface BBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ViewBoxResult {
  viewBox: string; // "0 0 width height"
  scale: number; // pixels per unit
}

export interface Point {
  x: number;
  y: number;
}

/**
 * Compute bounding box from an array of polygon or linear entities
 * @param entities Array of PolygonEntity or LinearEntity objects
 * @returns BBox with minX, minY, maxX, maxY
 */
export function computeBbox(
  entities: (PolygonEntity | LinearEntity)[]
): BBox {
  if (entities.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const entity of entities) {
    if ("polygon" in entity) {
      // PolygonEntity: iterate through all rings
      for (const ring of entity.polygon) {
        for (const [x, y] of ring) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    } else {
      // LinearEntity: iterate through path
      for (const [x, y] of entity.path) {
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }

  return {
    minX: isFinite(minX) ? minX : 0,
    minY: isFinite(minY) ? minY : 0,
    maxX: isFinite(maxX) ? maxX : 0,
    maxY: isFinite(maxY) ? maxY : 0,
  };
}

/**
 * Compute SVG viewBox and scale for a bounding box
 * @param bbox Bounding box
 * @param padding Padding in pixels around the bbox
 * @param maxWidth Maximum canvas width
 * @param maxHeight Maximum canvas height
 * @returns ViewBoxResult with viewBox string and scale
 */
export function computeViewBox(
  bbox: BBox,
  padding: number = 20,
  maxWidth: number = 2000,
  maxHeight: number = 2000
): ViewBoxResult {
  // Add padding to bbox
  const paddedMinX = bbox.minX - padding;
  const paddedMinY = bbox.minY - padding;
  const paddedMaxX = bbox.maxX + padding;
  const paddedMaxY = bbox.maxY + padding;

  const paddedWidth = paddedMaxX - paddedMinX;
  const paddedHeight = paddedMaxY - paddedMinY;

  // Avoid division by zero
  if (paddedWidth === 0 || paddedHeight === 0) {
    return {
      viewBox: `0 0 ${maxWidth} ${maxHeight}`,
      scale: 1.0,
    };
  }

  // Compute scale to fit within max dimensions
  const scaleX = maxWidth / paddedWidth;
  const scaleY = maxHeight / paddedHeight;
  const scale = Math.max(1.0, Math.min(scaleX, scaleY));

  // Compute scaled dimensions
  const scaledWidth = Math.ceil(paddedWidth * scale);
  const scaledHeight = Math.ceil(paddedHeight * scale);

  return {
    viewBox: `0 0 ${scaledWidth} ${scaledHeight}`,
    scale,
  };
}

/**
 * Buffer a polyline path to create a polygon
 * @param centerline Array of [x, y] coordinates (at least 2 points)
 * @param width Width of the buffer
 * @returns Polygon as array of rings [[[x, y], ...]]
 */
export function bufferPath(
  centerline: number[][],
  width: number
): number[][][] {
  if (centerline.length < 2) {
    throw new Error("centerline must have at least 2 points");
  }

  if (width <= 0) {
    throw new Error("width must be > 0");
  }

  // Convert centerline to GeoJSON Feature LineString
  // Turf expects [lon, lat] but we use abstract coordinates
  // For local coordinate systems, we can use the coordinates as-is
  const lineFeature = turf.lineString(centerline as any);

  // Buffer the line using Turf
  // Note: Turf.buffer expects distance in kilometers; for abstract local coords,
  // we interpret width as degrees (or abstract units)
  // Convert width to a reasonable scale for Turf (it uses great circle distances)
  // For a local system, use width directly as distance
  const buffered = turf.buffer(lineFeature, width, { units: "degrees" });

  if (!buffered || buffered.geometry.type !== "Polygon") {
    // Fallback: create simple rectangle buffer
    return createSimpleRectangleBuffer(centerline, width);
  }

  // Extract the polygon coordinates
  return buffered.geometry.coordinates;
}

/**
 * Simple fallback rectangle buffer for a path
 */
function createSimpleRectangleBuffer(
  centerline: number[][],
  width: number
): number[][][] {
  if (centerline.length < 2) {
    return [[]];
  }

  const result: number[][] = [];

  // For each segment, compute perpendicular offset
  // Create offset points on both sides

  // Forward pass: left offset points
  for (let i = 0; i < centerline.length; i++) {
    const p = centerline[i];
    const tangent = getTangent(centerline, i);
    const perpendicular = [-tangent[1], tangent[0]];
    const length = Math.sqrt(
      perpendicular[0] ** 2 + perpendicular[1] ** 2
    );
    if (length > 0) {
      const normalized = [
        (perpendicular[0] / length) * width,
        (perpendicular[1] / length) * width,
      ];
      result.push([p[0] + normalized[0], p[1] + normalized[1]]);
    }
  }

  // Backward pass: right offset points
  for (let i = centerline.length - 1; i >= 0; i--) {
    const p = centerline[i];
    const tangent = getTangent(centerline, i);
    const perpendicular = [-tangent[1], tangent[0]];
    const length = Math.sqrt(
      perpendicular[0] ** 2 + perpendicular[1] ** 2
    );
    if (length > 0) {
      const normalized = [
        (-perpendicular[0] / length) * width,
        (-perpendicular[1] / length) * width,
      ];
      result.push([p[0] + normalized[0], p[1] + normalized[1]]);
    }
  }

  // Close the ring
  if (result.length > 0 && result[0] !== result[result.length - 1]) {
    result.push([...result[0]]);
  }

  return [result];
}

/**
 * Get tangent vector at a point along a path
 */
function getTangent(path: number[][], index: number): number[] {
  if (index === 0) {
    // First point: tangent is direction to next point
    return [path[1][0] - path[0][0], path[1][1] - path[0][1]];
  } else if (index === path.length - 1) {
    // Last point: tangent is direction from previous point
    return [path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]];
  } else {
    // Middle point: average direction
    const prev = [path[index][0] - path[index - 1][0], path[index][1] - path[index - 1][1]];
    const next = [path[index + 1][0] - path[index][0], path[index + 1][1] - path[index][1]];
    return [(prev[0] + next[0]) / 2, (prev[1] + next[1]) / 2];
  }
}

/**
 * Get centroid of a polygon
 * @param polygon Polygon as array of rings
 * @returns Point with x and y coordinates
 */
export function getCentroid(polygon: number[][][]): Point {
  if (polygon.length === 0 || polygon[0].length === 0) {
    return { x: 0, y: 0 };
  }

  // Ensure polygon rings are closed (first and last points are the same)
  const closedPolygon = polygon.map((ring) => {
    if (ring.length > 0 &&
        (ring[0][0] !== ring[ring.length - 1][0] ||
         ring[0][1] !== ring[ring.length - 1][1])) {
      // Ring is not closed, close it
      return [...ring, ring[0]];
    }
    return ring;
  });

  // Create GeoJSON Feature Polygon
  const feature = turf.polygon(closedPolygon as any);

  // Get centroid using Turf
  const centroidFeature = turf.centroid(feature);

  return {
    x: centroidFeature.geometry.coordinates[0],
    y: centroidFeature.geometry.coordinates[1],
  };
}
