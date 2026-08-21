import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  computePointAlongPath,
  computeWallAngle,
  computePerpendicularOffset,
  cutWallOpening,
  cutWallOpenings,
  type CutWallResult,
  type Coordinates,
  type Point,
} from "../src/render/openings.js";
import type { Opening } from "../src/schema.js";

// Shoelace area of a single ring (handles closed or open rings).
function ringArea(ring: number[][]): number {
  let a = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    a += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(a) / 2;
}

// Total area across all resulting wall polygons (outer rings).
function totalArea(polys: Coordinates[][][]): number {
  return polys.reduce((sum, poly) => sum + ringArea(poly[0]), 0);
}

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

// Test 9: cutWallOpening cuts a real gap and generates a door marker
test("cutWallOpening cuts a gap and generates door marker", () => {
  const wallPolygon: Coordinates[][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: Coordinates[] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 0.5,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  const markerStr = result.markers[0];
  assert(markerStr.includes("path"), "Door marker should be a <path>");
  assert(markerStr.includes("<") && markerStr.includes(">"), "Expected valid SVG element");

  // A mid-wall through-gap splits the wall into two polygons.
  assert.equal(result.wallPolygons.length, 2, "Mid-wall opening should split the wall");
  // Removed area ≈ width * thickness = 1 * 1 = 1 (original area 10).
  assert(Math.abs(totalArea(result.wallPolygons) - 9) < 0.01, `Expected ~9, got ${totalArea(result.wallPolygons)}`);
});

// Test 10: cutWallOpening cuts a gap and generates a window marker
test("cutWallOpening cuts a gap and generates window marker", () => {
  const wallPolygon: Coordinates[][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: Coordinates[] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "window1",
    wallId: "wall1",
    positionAlongWall: 0.5,
    width: 0.8,
    type: "window",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  assert(result.markers[0].includes("line"), "Window marker should contain <line> elements");

  assert.equal(result.wallPolygons.length, 2, "Mid-wall window should split the wall");
  assert(Math.abs(totalArea(result.wallPolygons) - 9.2) < 0.01, `Expected ~9.2, got ${totalArea(result.wallPolygons)}`);
});

// Test 11: cutWallOpening at start of wall (positionAlongWall=0)
test("cutWallOpening at start of wall (positionAlongWall=0)", () => {
  const wallPolygon: Coordinates[][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: Coordinates[] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 0,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  // Gap at the corner removes ~half the opening width (0.5), leaving one piece.
  assert.equal(result.wallPolygons.length, 1, "End cut should leave a single piece");
  assert(Math.abs(totalArea(result.wallPolygons) - 9.5) < 0.01, `Expected ~9.5, got ${totalArea(result.wallPolygons)}`);
});

// Test 12: cutWallOpening at end of wall (positionAlongWall=1)
test("cutWallOpening at end of wall (positionAlongWall=1)", () => {
  const wallPolygon: Coordinates[][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: Coordinates[] = [[0, 0], [10, 0]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 1,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  assert.equal(result.wallPolygons.length, 1, "End cut should leave a single piece");
  assert(Math.abs(totalArea(result.wallPolygons) - 9.5) < 0.01, `Expected ~9.5, got ${totalArea(result.wallPolygons)}`);
});

// Test 13: Multiple openings on the same wall cut multiple gaps
test("Multiple openings on same wall", () => {
  const wallPolygon: Coordinates[][] = [[[0, 0], [10, 0], [10, 1], [0, 1]]];
  const wallPath: Coordinates[] = [[0, 0], [10, 0]];

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

  const result = cutWallOpenings(wallPolygon, wallPath, [opening1, opening2]);

  assert.equal(result.markers.length, 2, "Expected 2 markers");
  // Two interior gaps split the wall into three pieces.
  assert.equal(result.wallPolygons.length, 3, "Two interior openings should yield three pieces");
  // Removed area = 0.8 + 1 = 1.8; remaining = 10 - 1.8 = 8.2.
  assert(Math.abs(totalArea(result.wallPolygons) - 8.2) < 0.01, `Expected ~8.2, got ${totalArea(result.wallPolygons)}`);
});

// Test 14: Gap is cut through a vertical wall (angle-aware)
test("cutWallOpening cuts through a vertical wall", () => {
  const wallPolygon: Coordinates[][] = [[[0, 0], [0, 10], [1, 10], [1, 0]]];
  const wallPath: Coordinates[] = [[0, 0], [0, 10]];
  const opening: Opening = {
    id: "door1",
    wallId: "wall1",
    positionAlongWall: 0.5,
    width: 1,
    type: "door",
  };
  const result = cutWallOpening(wallPolygon, wallPath, opening);

  assert(result.markers.length >= 1, "Expected at least 1 marker");
  assert(result.markers[0].includes("<"), "Expected valid SVG marker");
  assert.equal(result.wallPolygons.length, 2, "Mid-wall opening should split the vertical wall");
  assert(Math.abs(totalArea(result.wallPolygons) - 9) < 0.01, `Expected ~9, got ${totalArea(result.wallPolygons)}`);
});
