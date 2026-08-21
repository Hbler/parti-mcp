import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  computeBbox,
  computeViewBox,
  bufferPath,
  getCentroid,
  type PolygonEntity,
  type LinearEntity,
  type BBox,
  type Point,
} from "../src/geometry.js";

// Test 1: computeBbox with 3 points
test("computeBbox with 3 polygon points", () => {
  const entities: PolygonEntity[] = [
    { polygon: [[[0, 0], [100, 0], [50, 50]]] },
  ];
  const bbox = computeBbox(entities);
  assert.equal(bbox.minX, 0);
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxX, 100);
  assert.equal(bbox.maxY, 50);
});

// Test 2: computeBbox with empty array
test("computeBbox with empty array", () => {
  const entities: (PolygonEntity | LinearEntity)[] = [];
  const bbox = computeBbox(entities);
  assert.equal(bbox.minX, 0);
  assert.equal(bbox.minY, 0);
  assert.equal(bbox.maxX, 0);
  assert.equal(bbox.maxY, 0);
});

// Test 3: computeViewBox with default padding
test("computeViewBox with default padding", () => {
  const bbox: BBox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };
  const result = computeViewBox(bbox, 20, 1000, 1000);

  // Padded box: -20, -20, 120, 120 (140x140)
  // scale = min(1000/140, 1000/140) = 1000/140 ≈ 7.14
  assert(result.viewBox.includes("0 0"));
  assert(result.scale >= 1.0);
  assert.equal(typeof result.viewBox, "string");
  assert.equal(typeof result.scale, "number");
});

// Test 4: getCentroid of unit square
test("getCentroid of unit square", () => {
  const polygon = [[[0, 0], [1, 0], [1, 1], [0, 1]]];
  const centroid = getCentroid(polygon);

  // Centroid should be approximately at center (0.5, 0.5)
  assert(Math.abs(centroid.x - 0.5) < 0.1, `x=${centroid.x}, expected ~0.5`);
  assert(Math.abs(centroid.y - 0.5) < 0.1, `y=${centroid.y}, expected ~0.5`);
});

// Test 5: getCentroid of rectangle
test("getCentroid of rectangle", () => {
  const polygon = [[[0, 0], [10, 0], [10, 2], [0, 2]]];
  const centroid = getCentroid(polygon);

  // Centroid should be at (5, 1)
  assert(Math.abs(centroid.x - 5) < 0.1, `x=${centroid.x}, expected ~5`);
  assert(Math.abs(centroid.y - 1) < 0.1, `y=${centroid.y}, expected ~1`);
});

// Test 6: bufferPath of simple horizontal line
test("bufferPath of simple horizontal line", () => {
  const line = [[0, 0], [10, 0]];
  const buffered = bufferPath(line, 2);

  // Should produce a polygon with at least 4 points (buffered rectangle)
  assert(Array.isArray(buffered), "buffered should be array of rings");
  assert(buffered.length > 0, "buffered should have at least 1 ring");
  assert(buffered[0].length >= 4, "outer ring should have >= 4 corner points");
});

// Test 7: bufferPath with valid width produces valid coordinates
test("bufferPath produces valid coordinates", () => {
  const line = [[0, 0], [5, 5]];
  const buffered = bufferPath(line, 1);

  // Verify output structure
  assert(Array.isArray(buffered), "output should be array");
  const ring = buffered[0];
  assert(Array.isArray(ring), "ring should be array");

  // Each point should be [number, number]
  for (const point of ring) {
    assert.equal(point.length, 2);
    assert(typeof point[0] === "number");
    assert(typeof point[1] === "number");
    assert(Number.isFinite(point[0]));
    assert(Number.isFinite(point[1]));
  }
});
