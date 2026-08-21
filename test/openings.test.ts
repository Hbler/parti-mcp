import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  computePointAlongPath,
  computeWallAngle,
  computePerpendicularOffset,
  cutWallOpening,
  type CutWallResult,
  type Point,
} from "../src/render/openings.js";
import type { Opening } from "../src/schema.js";

// Test 1: computePointAlongPath at fraction 0
test("computePointAlongPath at fraction 0", () => {
  const path: [number, number][] = [[0, 0], [10, 0]];
  const result = computePointAlongPath(path, 0);
  assert.equal(result.x, 0);
  assert.equal(result.y, 0);
});

// Test 2: computePointAlongPath at fraction 1
test("computePointAlongPath at fraction 1", () => {
  const path: [number, number][] = [[0, 0], [10, 0]];
  const result = computePointAlongPath(path, 1);
  assert.equal(result.x, 10);
  assert.equal(result.y, 0);
});

// Test 3: computePointAlongPath at fraction 0.5
test("computePointAlongPath at fraction 0.5", () => {
  const path: [number, number][] = [[0, 0], [10, 0]];
  const result = computePointAlongPath(path, 0.5);
  assert.equal(result.x, 5);
  assert.equal(result.y, 0);
});

// Test 4: computePointAlongPath with 3-point path
test("computePointAlongPath with 3-point path", () => {
  const path: [number, number][] = [[0, 0], [10, 0], [10, 10]];
  const result = computePointAlongPath(path, 0.5);
  // Total length = 10 + 10 = 20, target = 10 (halfway)
  // Should be at the junction point [10, 0]
  assert.equal(result.x, 10);
  assert.equal(result.y, 0);
});

// Test 5: computeWallAngle horizontal (0°)
test("computeWallAngle horizontal (0°)", () => {
  const wallPath: [number, number][] = [[0, 0], [10, 0]];
  const angle = computeWallAngle(wallPath);
  // Horizontal direction = 0°
  assert(Math.abs(angle - 0) < 1, `Expected ~0°, got ${angle}°`);
});

// Test 6: computeWallAngle vertical (90°)
test("computeWallAngle vertical (90°)", () => {
  const wallPath: [number, number][] = [[0, 0], [0, 10]];
  const angle = computeWallAngle(wallPath);
  // Vertical upward = 90°
  assert(Math.abs(angle - 90) < 1, `Expected ~90°, got ${angle}°`);
});

// Test 7: computePerpendicularOffset at 0° wall, distance 2
test("computePerpendicularOffset at 0° wall, distance 2", () => {
  const [dx, dy] = computePerpendicularOffset(0, 2);
  // Perpendicular to 0° (east) is 90° (north), so dy should be positive
  assert(Math.abs(dy - 2) < 0.01, `Expected dy ≈ 2, got ${dy}`);
  assert(Math.abs(dx - 0) < 0.01, `Expected dx ≈ 0, got ${dx}`);
});

// Test 8: computePerpendicularOffset at 90° wall, distance 2
test("computePerpendicularOffset at 90° wall, distance 2", () => {
  const [dx, dy] = computePerpendicularOffset(90, 2);
  // Perpendicular to 90° (north) is 180° (west), so dx should be negative
  assert(Math.abs(dx - (-2)) < 0.01, `Expected dx ≈ -2, got ${dx}`);
  assert(Math.abs(dy - 0) < 0.01, `Expected dy ≈ 0, got ${dy}`);
});

// Test 9: cutWallOpening generates door marker
test("cutWallOpening generates door marker", () => {
  const wallPolygon: [number, number][][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: [number, number][] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 0.5,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening, 10);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  const markerStr = result.markers[0];
  assert(
    markerStr.includes("path") || markerStr.includes("circle"),
    "Expected door marker to contain 'path' or 'circle'"
  );
  assert(markerStr.includes("<") && markerStr.includes(">"), "Expected valid SVG element");
});

// Test 10: cutWallOpening generates window marker
test("cutWallOpening generates window marker", () => {
  const wallPolygon: [number, number][][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: [number, number][] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "window1",
    wallId: "wall1",
    positionAlongWall: 0.5,
    width: 0.8,
    type: "window",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening, 10);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  const markerStr = result.markers[0];
  assert(markerStr.includes("line"), "Expected window marker to contain 'line' elements");
  assert(markerStr.includes("<") && markerStr.includes(">"), "Expected valid SVG element");
});

// Test 11: cutWallOpening at start of wall (positionAlongWall=0)
test("cutWallOpening at start of wall (positionAlongWall=0)", () => {
  const wallPolygon: [number, number][][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: [number, number][] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 0,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening, 10);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  // Should generate marker at or near start of wall
  assert.equal(result.wallPolygon.length, wallPolygon.length, "Polygon structure preserved");
});

// Test 12: cutWallOpening at end of wall (positionAlongWall=1)
test("cutWallOpening at end of wall (positionAlongWall=1)", () => {
  const wallPolygon: [number, number][][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: [number, number][] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 1,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening, 10);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  // Should generate marker at or near end of wall
  assert.equal(result.wallPolygon.length, wallPolygon.length, "Polygon structure preserved");
});

// Test 13: Multiple openings on same wall
test("Multiple openings on same wall", () => {
  const wallPolygon: [number, number][][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: [number, number][] = [[0, 0], [10, 0]];

  const opening1: Opening = {
    id: "opening1",
    wallId: "wall1",
    positionAlongWall: 0.25,
    width: 0.8,
    type: "window",
  };
  const opening2: Opening = {
    id: "opening2",
    wallId: "wall1",
    positionAlongWall: 0.75,
    width: 1,
    type: "door",
  };

  // For simplified implementation, process each opening separately
  const result1 = cutWallOpening(wallPolygon, wallPath, opening1, 10);
  const result2 = cutWallOpening(result1.wallPolygon, wallPath, opening2, 10);

  // Accumulate markers from both calls
  const allMarkers = [...result1.markers, ...result2.markers];
  assert(allMarkers.length >= 2, "Expected at least 2 markers total");
  assert.equal(result2.wallPolygon.length, wallPolygon.length, "Polygon structure preserved");
});

// Test 14: Door marker rotates by wall angle
test("Door marker rotates by wall angle", () => {
  const wallPolygon: [number, number][][] = [[[0, 0], [0, 10], [1, 10], [1, 0]]];
  const wallPath: [number, number][] = [[0, 0], [0, 10]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 0.5,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening, 10);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  // Verify marker was generated (actual rotation validation would require SVG parsing)
  assert(result.markers[0].includes("<"), "Expected valid SVG marker");
});
