import * as clipperLib from "js-angusj-clipper";

export type ClipperInstance = Awaited<
  ReturnType<typeof clipperLib.loadNativeClipperLibInstanceAsync>
>;

export type Coordinate = [number, number];
export type Polygon = Coordinate[];

let clipperInstance: ClipperInstance | null = null;

// Fixed precision multiplier for integer conversion
// Clipper requires integer coordinates; we scale model coords by this factor
const PRECISION_MULTIPLIER = 10000;

export async function initializeClipper(): Promise<ClipperInstance> {
  if (clipperInstance) {
    return clipperInstance;
  }

  clipperInstance = await clipperLib.loadNativeClipperLibInstanceAsync(
    clipperLib.NativeClipperLibRequestedFormat.WasmWithAsmJsFallback
  );

  return clipperInstance;
}

export function getClipper(): ClipperInstance {
  if (!clipperInstance) {
    throw new Error("Clipper not initialized. Call initializeClipper() first.");
  }
  return clipperInstance;
}

/**
 * Convert [x, y] array to {x, y} IntPoint object
 */
function coordToIntPoint(coord: Coordinate): { x: number; y: number } {
  return {
    x: Math.round(coord[0] * PRECISION_MULTIPLIER),
    y: Math.round(coord[1] * PRECISION_MULTIPLIER),
  };
}

/**
 * Convert {x, y} IntPoint back to [x, y] array
 */
function intPointToCoord(point: { x: number; y: number }): Coordinate {
  return [point.x / PRECISION_MULTIPLIER, point.y / PRECISION_MULTIPLIER];
}

/**
 * Scale a polygon (array of coordinates) to IntPoint array
 */
function scalePolygonToInt(polygon: Polygon): Array<{ x: number; y: number }> {
  return polygon.map(coordToIntPoint);
}

/**
 * Scale a polygon back to model coordinates
 */
function scalePolygonFromInt(
  polygon: Array<{ x: number; y: number }>
): Polygon {
  return polygon.map(intPointToCoord);
}

/**
 * Offset a centerline (open polyline) by a thickness to create a closed band
 * Uses Clipper's offsetToPaths with OpenButt end type and Miter join type
 *
 * @param clipper Clipper instance
 * @param path Centerline as [[x,y], [x,y], ...]
 * @param thickness Thickness (distance to offset)
 * @returns Array of closed polygons representing the band
 */
export function offsetCenterline(
  clipper: ClipperInstance,
  path: Polygon,
  thickness: number
): Polygon[] {
  // Scale path to integers
  const scaledPath = scalePolygonToInt(path);

  // Clipper's offset is for the distance from the centerline
  // To create a band, we offset by half the thickness
  const delta = (thickness / 2) * PRECISION_MULTIPLIER;

  const result = clipper.offsetToPaths({
    delta,
    offsetInputs: [
      {
        data: scaledPath,
        joinType: clipperLib.JoinType.Miter,
        endType: clipperLib.EndType.OpenButt,
      },
    ],
  });

  // Handle undefined result (failed offset)
  if (!result) {
    return [];
  }

  // Scale results back to model coordinates
  const polygons: Polygon[] = [];
  for (const path of result) {
    polygons.push(scalePolygonFromInt(path));
  }

  return polygons;
}

/**
 * Union multiple closed polygons into one or more merged polygons
 * Uses Clipper's clipToPaths with Union operation
 *
 * @param clipper Clipper instance
 * @param polygons Array of closed polygons to union
 * @returns Array of merged polygons
 */
export function unionPolygons(
  clipper: ClipperInstance,
  polygons: Polygon[]
): Polygon[] {
  if (polygons.length === 0) {
    return [];
  }

  if (polygons.length === 1) {
    return polygons;
  }

  // Scale all polygons to integers
  const scaledPolygons = polygons.map(scalePolygonToInt);

  // For union operation, pass all polygons as subject inputs
  // clipInputs is omitted (not needed for union)
  //
  // NonZero (not EvenOdd) is required here: these are solid, possibly-
  // overlapping regions being merged into one shape. EvenOdd treats any
  // doubly-covered area (the actual overlap between two bands at a
  // junction) as a hole, since each boundary crossing toggles fill/no-fill
  // — that splits what should be one solid merged polygon into a shape
  // with the overlap subtracted out, which surfaced as "2 paths instead
  // of 1" at wall/road junctions. NonZero treats any winding-covered area
  // as filled regardless of how many subject polygons cover it.
  const result = clipper.clipToPaths({
    clipType: clipperLib.ClipType.Union,
    subjectInputs: scaledPolygons.map((data) => ({
      data,
      closed: true,
    })),
    subjectFillType: clipperLib.PolyFillType.NonZero,
  });

  // Scale results back
  const mergedPolygons: Polygon[] = [];
  for (const path of result) {
    mergedPolygons.push(scalePolygonFromInt(path));
  }

  return mergedPolygons;
}

/**
 * Subtract cutter polygons from a subject polygon
 * Uses Clipper's clipToPaths with Difference operation
 *
 * @param clipper Clipper instance
 * @param subject Subject polygon (what to keep)
 * @param cutters Array of polygons to subtract from subject
 * @returns Array of resulting polygons (may be multiple if the cut creates separate pieces)
 */
export function differencePolygons(
  clipper: ClipperInstance,
  subject: Polygon,
  cutters: Polygon[]
): Polygon[] {
  if (cutters.length === 0) {
    return [subject];
  }

  // Scale to integers
  const scaledSubject = scalePolygonToInt(subject);
  const scaledCutters = cutters.map(scalePolygonToInt);

  // Use clipToPaths with Difference operation
  const result = clipper.clipToPaths({
    clipType: clipperLib.ClipType.Difference,
    subjectInputs: [{ data: scaledSubject, closed: true }],
    clipInputs: scaledCutters.map((data) => ({ data })),
    subjectFillType: clipperLib.PolyFillType.EvenOdd,
  });

  // Scale results back
  const resultPolygons: Polygon[] = [];
  for (const path of result) {
    resultPolygons.push(scalePolygonFromInt(path));
  }

  return resultPolygons;
}
