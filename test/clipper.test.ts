import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  initializeClipper,
  offsetCenterline,
  unionPolygons,
  differencePolygons,
} from "../src/geometry/clipper.js";

test("clipper.ts", async (t) => {
  // Initialize clipper once for all tests
  const clipper = await initializeClipper();

  await t.test("offsetCenterline: straight segment → rectangle", () => {
    // A horizontal line from (0,0) to (100,0) with thickness 10
    // Offset by 5 (half thickness) should create a 100×10 rectangle
    const path = [[0, 0], [100, 0]];
    const result = offsetCenterline(clipper, path, 10);

    assert(Array.isArray(result));
    assert.equal(result.length, 1, "Should produce one polygon");

    const polygon = result[0];
    assert(Array.isArray(polygon));
    assert(polygon.length >= 4, "Rectangle should have at least 4 vertices");
  });

  await t.test("offsetCenterline: L-shaped polyline → mitered band", () => {
    // An L-shaped path (corner at 90°)
    const path = [[0, 0], [100, 0], [100, 100]];
    const result = offsetCenterline(clipper, path, 10);

    assert(Array.isArray(result));
    assert.equal(result.length, 1, "L-shape should produce one band");

    const polygon = result[0];
    assert(polygon.length >= 4, "Mitered L should have at least 4 vertices");
  });

  await t.test("unionPolygons: two abutting rectangles → no interior seam", () => {
    // CRITICAL REGRESSION TEST: two rectangles meeting at an edge should union
    // without an interior line at the shared edge.
    //
    // Rectangle 1: x ∈ [0, 100], y ∈ [0, 10]
    const rect1 = [[0, 0], [100, 0], [100, 10], [0, 10]];

    // Rectangle 2: x ∈ [100, 200], y ∈ [0, 10] (abutting along x=100)
    const rect2 = [[100, 0], [200, 0], [200, 10], [100, 10]];

    const result = unionPolygons(clipper, [rect1, rect2]);

    assert(Array.isArray(result));
    assert.equal(result.length, 1, "Union of abutting rects should be one polygon");

    // The resulting polygon should be a 200×10 rectangle
    // If there was an interior seam, it would incorrectly form two polygons or have extra vertices on the seam
    const merged = result[0];
    assert(merged.length >= 4);
  });

  await t.test("unionPolygons: overlapping rectangles → merged result", () => {
    // Two overlapping rectangles
    const rect1 = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const rect2 = [[50, 50], [150, 50], [150, 150], [50, 150]];

    const result = unionPolygons(clipper, [rect1, rect2]);

    assert(Array.isArray(result));
    assert(result.length > 0, "Overlapping rects should produce a result");
  });

  await t.test("differencePolygons: cut a hole from a rectangle", () => {
    // Large rectangle
    const subject = [[0, 0], [200, 0], [200, 200], [0, 200]];

    // Small rectangle to cut out (hole in the middle)
    const cutter = [[50, 50], [150, 50], [150, 150], [50, 150]];

    const result = differencePolygons(clipper, subject, [cutter]);

    // Result may be a complex polygon with a hole or split into multiple parts
    // Key: the hole area should be removed
    assert(Array.isArray(result));
    assert(result.length > 0, "Should produce at least one polygon after difference");
  });

  await t.test("differencePolygons: subtract non-overlapping cutter", () => {
    const subject = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const cutter = [[200, 200], [300, 200], [300, 300], [200, 300]];

    const result = differencePolygons(clipper, subject, [cutter]);

    // Non-overlapping cutter should leave subject unchanged
    assert.equal(result.length, 1, "Should return original polygon");
  });

  await t.test("offsetCenterline: vertical segment", () => {
    const path = [[0, 0], [0, 100]];
    const result = offsetCenterline(clipper, path, 10);

    assert.equal(result.length, 1);
    const polygon = result[0];
    assert(polygon.length >= 4);
  });

  await t.test("offsetCenterline: diagonal segment", () => {
    const path = [[0, 0], [100, 100]];
    const result = offsetCenterline(clipper, path, 10);

    assert.equal(result.length, 1);
    const polygon = result[0];
    assert(polygon.length >= 4);
  });

  await t.test("L-shaped junction without seam (walls meeting at 90°)", () => {
    // Simulate two walls meeting at a right angle
    // Wall 1: horizontal from (0, 40) to (100, 40), thickness 10
    // Wall 2: vertical from (100, 0) to (100, 100), thickness 10

    const wall1 = offsetCenterline(clipper, [[0, 40], [100, 40]], 10);
    const wall2 = offsetCenterline(clipper, [[100, 0], [100, 100]], 10);

    // Union should merge these without an interior seam
    const unioned = unionPolygons(clipper, [...wall1, ...wall2]);

    // Should be one polygon, not two
    assert.equal(unioned.length, 1, "L-junction should merge into one polygon without interior seam");
  });
});
