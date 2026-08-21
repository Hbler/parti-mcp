import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  getBbox,
  getPolygonArea,
  getCentroid,
  getPointAlongPath,
  getPerpendicular,
  getDoorcSwingArc,
} from "../src/geometry/primitives.js";

test("primitives.ts", async (t) => {
  await t.test("getBbox: simple rectangle", () => {
    const polygon = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const bbox = getBbox([polygon]);

    assert.equal(bbox.minX, 0);
    assert.equal(bbox.minY, 0);
    assert.equal(bbox.maxX, 100);
    assert.equal(bbox.maxY, 50);
  });

  await t.test("getBbox: multiple polygons", () => {
    const poly1 = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const poly2 = [[200, 50], [300, 50], [300, 150], [200, 150]];

    const bbox = getBbox([poly1, poly2]);

    assert.equal(bbox.minX, 0);
    assert.equal(bbox.minY, 0);
    assert.equal(bbox.maxX, 300);
    assert.equal(bbox.maxY, 150);
  });

  await t.test("getPolygonArea: unit square", () => {
    const polygon = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const area = getPolygonArea(polygon);

    assert(Math.abs(area - 1.0) < 0.001, "Unit square should have area 1");
  });

  await t.test("getPolygonArea: 10×10 square", () => {
    const polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const area = getPolygonArea(polygon);

    assert(Math.abs(area - 100.0) < 0.1, "10×10 square should have area 100");
  });

  await t.test("getCentroid: rectangle", () => {
    const polygon = [[0, 0], [100, 0], [100, 50], [0, 50]];
    const centroid = getCentroid(polygon);

    assert.equal(centroid[0], 50, "Centroid x should be 50");
    assert.equal(centroid[1], 25, "Centroid y should be 25");
  });

  await t.test("getCentroid: square", () => {
    const polygon = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const centroid = getCentroid(polygon);

    assert.equal(centroid[0], 5, "Centroid x of 10×10 square should be 5");
    assert.equal(centroid[1], 5, "Centroid y of 10×10 square should be 5");
  });

  await t.test("getPointAlongPath: halfway along straight segment", () => {
    const path = [[0, 0], [100, 0]];
    const point = getPointAlongPath(path, 0.5);

    assert.equal(point[0], 50, "Halfway along horizontal line should be at x=50");
    assert.equal(point[1], 0);
  });

  await t.test("getPointAlongPath: start of path", () => {
    const path = [[10, 20], [100, 100]];
    const point = getPointAlongPath(path, 0);

    assert.equal(point[0], 10);
    assert.equal(point[1], 20);
  });

  await t.test("getPointAlongPath: end of path", () => {
    const path = [[10, 20], [100, 100]];
    const point = getPointAlongPath(path, 1);

    assert.equal(point[0], 100);
    assert.equal(point[1], 100);
  });

  await t.test("getPerpendicular: left offset from horizontal line", () => {
    const path = [[0, 0], [100, 0]];
    const position = 0.5; // halfway
    const offset = 5; // perpendicular offset

    const perpPoint = getPerpendicular(path, position, offset);

    assert(perpPoint[0] > 0, "Perpendicular point should exist");
    // For a horizontal line, perpendicular offset should move in y direction
    assert(Math.abs(perpPoint[1]) > 0, "Perpendicular offset should affect y");
  });

  await t.test("getDoorcSwingArc: door centered on wall", () => {
    // Vertical wall from (0, 0) to (0, 100)
    const wallPath = [[0, 0], [0, 100]];
    const position = 0.5; // Door at center
    const width = 0.9; // 90cm door
    const hingeAtStart = true;
    const swingRight = true;

    const arcPath = getDoorcSwingArc(
      wallPath,
      position,
      width,
      hingeAtStart,
      swingRight
    );

    assert(Array.isArray(arcPath));
    assert(arcPath.length > 2, "Arc should have multiple points");
  });

  await t.test("getDoorcSwingArc: door at wall start", () => {
    const wallPath = [[50, 50], [50, 150]];
    const position = 0; // At start
    const width = 1;
    const hingeAtStart = true;
    const swingRight = true;

    const arcPath = getDoorcSwingArc(
      wallPath,
      position,
      width,
      hingeAtStart,
      swingRight
    );

    assert(Array.isArray(arcPath));
    assert(arcPath.length >= 2);
  });
});
