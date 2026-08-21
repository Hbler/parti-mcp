import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  MapSpecSchema,
  BlockSchema,
  BuildingSchema,
  RoadSchema,
  GreenSpaceSchema,
  StyleSchema,
  LabelSchema,
  RoomSchema,
  WallSchema,
  OpeningSchema,
  FloorSchema,
  FloorPlanSpecSchema,
  type MapSpec,
  type Block,
  type Building,
  type Road,
  type GreenSpace,
  type Style,
  type Label,
  type Room,
  type Wall,
  type Opening,
  type Floor,
  type FloorPlanSpec,
} from "../src/schema.js";

// Test 1: Minimal valid MapSpec parses
test("Minimal valid MapSpec parses", () => {
  const input = {
    buildings: [{ id: "b1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }],
  };
  const result = MapSpecSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 2: Minimal Block parses
test("Minimal Block parses", () => {
  const input = { id: "blk1", polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]] };
  const result = BlockSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 3: Minimal Building parses
test("Minimal Building parses", () => {
  const input = { id: "bld1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
  const result = BuildingSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 4: Minimal Road parses
test("Minimal Road parses", () => {
  const input = { id: "road1", path: [[0, 0], [10, 10]], width: 5 };
  const result = RoadSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 5: Minimal GreenSpace parses
test("Minimal GreenSpace parses", () => {
  const input = { id: "park1", polygon: [[[0, 0], [50, 0], [50, 50], [0, 50]]] };
  const result = GreenSpaceSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 6: Style and Label parse
test("Style and Label parse", () => {
  const styleInput: Style = {
    fill: "#ff0000",
    stroke: "#000000",
    strokeWidth: 2,
    opacity: 0.8,
  };
  const styleResult = StyleSchema.safeParse(styleInput);
  assert.equal(styleResult.success, true, `Style parse failed: ${styleResult.success ? "" : styleResult.error?.message}`);

  const labelInput: Label = {
    text: "Building A",
    position: [10, 20],
    size: 12,
  };
  const labelResult = LabelSchema.safeParse(labelInput);
  assert.equal(labelResult.success, true, `Label parse failed: ${labelResult.success ? "" : labelResult.error?.message}`);
});

// Test 7: Missing required field rejected (e.g., Building without footprint)
test("Missing required field rejected", () => {
  const input = { id: "bld1" }; // no footprint
  const result = BuildingSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail without footprint");
});

// Test 8: Out-of-bounds coordinates rejected (NaN and Infinity)
test("Out-of-bounds coordinates rejected (NaN)", () => {
  const input = { id: "blk1", polygon: [[[NaN, 0], [10, 0], [10, 10], [0, 10]]] };
  const result = BlockSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with NaN coordinate");
});

test("Out-of-bounds coordinates rejected (Infinity)", () => {
  const input = { id: "blk1", polygon: [[[Infinity, 0], [10, 0], [10, 10], [0, 10]]] };
  const result = BlockSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with Infinity coordinate");
});

// Test 9: Invalid dimensions rejected (negative width)
test("Invalid dimensions rejected (negative width)", () => {
  const input = { id: "road1", path: [[0, 0], [10, 10]], width: -5 };
  const result = RoadSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with negative width");
});

// Test 9b: Invalid dimensions rejected (zero width)
test("Invalid dimensions rejected (zero width)", () => {
  const input = { id: "road1", path: [[0, 0], [10, 10]], width: 0 };
  const result = RoadSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with zero width");
});

// Test 9c: Invalid dimensions rejected (width exceeds max)
test("Invalid dimensions rejected (width exceeds max)", () => {
  const input = { id: "road1", path: [[0, 0], [10, 10]], width: 2000 };
  const result = RoadSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with width > 1000");
});

// Test 10: Polygon with < 3 points rejected
test("Polygon with < 3 points rejected", () => {
  const input = { id: "blk1", polygon: [[[0, 0], [10, 0]]] };
  const result = BlockSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with polygon < 3 points");
});

// Test 11: Building with invalid floorCount/height
test("Building with invalid floorCount (zero) rejected", () => {
  const input = { id: "bld1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]], floorCount: 0 };
  const result = BuildingSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with floorCount = 0");
});

test("Building with invalid floorCount (negative) rejected", () => {
  const input = { id: "bld1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]], floorCount: -1 };
  const result = BuildingSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with negative floorCount");
});

test("Building with invalid floorCount (exceeds max) rejected", () => {
  const input = { id: "bld1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]], floorCount: 1001 };
  const result = BuildingSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with floorCount > 1000");
});

test("Building with invalid height (negative) rejected", () => {
  const input = { id: "bld1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]], height: -1 };
  const result = BuildingSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with negative height");
});

test("Building with invalid height (exceeds max) rejected", () => {
  const input = { id: "bld1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]], height: 10001 };
  const result = BuildingSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with height > 10000");
});

// Test 12: MapSpec with bounds out-of-order rejected
test("MapSpec with bounds out-of-order rejected", () => {
  const input = {
    bounds: [100, 100, 0, 0],
    buildings: [{ id: "b1", footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }],
  };
  const result = MapSpecSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with minX > maxX");
});

// Test 13: MapSpec with no entities rejected
test("MapSpec with no entities rejected", () => {
  const input = { units: "meters" }; // no blocks/buildings/roads/greenspaces
  const result = MapSpecSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with no entities");
});

// Test 14: Entity count limits enforced (501 buildings)
test("Entity count limit enforced (501 buildings)", () => {
  const buildings = Array.from({ length: 501 }, (_, i) => ({
    id: `b${i}`,
    footprint: [[[0, 0], [1, 0], [1, 1], [0, 1]]],
  }));
  const input = { buildings };
  const result = MapSpecSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with 501 buildings (max 500)");
});

// Test 14b: Entity count limit enforced (201 roads)
test("Entity count limit enforced (201 roads)", () => {
  const roads = Array.from({ length: 201 }, (_, i) => ({
    id: `r${i}`,
    path: [[0, 0], [1, 1]],
    width: 5,
  }));
  const input = { roads };
  const result = MapSpecSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with 201 roads (max 200)");
});

// Test 15: Label with text > 500 chars rejected
test("Label with text > 500 chars rejected", () => {
  const longText = "a".repeat(501);
  const input = { text: longText };
  const result = LabelSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with text > 500 chars");
});

// Test 17: Minimal valid Floor parses
test("Minimal valid Floor parses", () => {
  const input = { id: "f0", level: 0, outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 18: Minimal valid Room parses
test("Minimal valid Room parses", () => {
  const input = { id: "r1", polygon: [[[0, 0], [5, 0], [5, 5], [0, 5]]], roomType: "bedroom" };
  const result = RoomSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 19: Minimal valid Wall parses
test("Minimal valid Wall parses", () => {
  const input = { id: "w1", path: [[0, 0], [10, 0]], thickness: 0.3 };
  const result = WallSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 20: Minimal valid Opening parses
test("Minimal valid Opening parses", () => {
  const input = { id: "op1", wallId: "w1", positionAlongWall: 0.5, width: 1, type: "door" };
  const result = OpeningSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 21: Minimal valid Floor with Room, Wall, Opening parses
test("Minimal valid Floor with Room, Wall, Opening parses", () => {
  const input = {
    id: "f0",
    level: 0,
    outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
    rooms: [{ id: "r1", polygon: [[[0, 0], [5, 0], [5, 5], [0, 5]]], roomType: "bedroom" }],
    walls: [{ id: "w1", path: [[0, 0], [10, 0]], thickness: 0.3 }],
    openings: [{ id: "op1", wallId: "w1", positionAlongWall: 0.5, width: 1, type: "door" }],
  };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 22: Minimal valid FloorPlanSpec parses
test("Minimal valid FloorPlanSpec parses", () => {
  const input = { floors: [{ id: "f0", level: 0, outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }] };
  const result = FloorPlanSpecSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 23: Multi-floor FloorPlanSpec parses
test("Multi-floor FloorPlanSpec parses", () => {
  const input = {
    floors: [
      { id: "f0", level: 0, outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]] },
      { id: "f1", level: 1, outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]] },
    ],
  };
  const result = FloorPlanSpecSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 24: Opening.positionAlongWall = 0 is valid
test("Opening.positionAlongWall = 0 is valid", () => {
  const input = { id: "op1", wallId: "w1", positionAlongWall: 0, width: 1, type: "door" };
  const result = OpeningSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 25: Opening.positionAlongWall = 1 is valid
test("Opening.positionAlongWall = 1 is valid", () => {
  const input = { id: "op1", wallId: "w1", positionAlongWall: 1, width: 1, type: "door" };
  const result = OpeningSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 26: Opening.positionAlongWall = -0.1 rejected
test("Opening.positionAlongWall = -0.1 rejected", () => {
  const input = { id: "op1", wallId: "w1", positionAlongWall: -0.1, width: 1, type: "door" };
  const result = OpeningSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with positionAlongWall < 0");
});

// Test 27: Opening.positionAlongWall = 1.1 rejected
test("Opening.positionAlongWall = 1.1 rejected", () => {
  const input = { id: "op1", wallId: "w1", positionAlongWall: 1.1, width: 1, type: "door" };
  const result = OpeningSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with positionAlongWall > 1");
});

// Test 28: Opening.width = 0 rejected
test("Opening.width = 0 rejected", () => {
  const input = { id: "op1", wallId: "w1", positionAlongWall: 0.5, width: 0, type: "door" };
  const result = OpeningSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with width = 0");
});

// Test 29: Opening.width = 100 rejected
test("Opening.width = 100 rejected", () => {
  const input = { id: "op1", wallId: "w1", positionAlongWall: 0.5, width: 100, type: "door" };
  const result = OpeningSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with width >= 100");
});

// Test 30: Opening referencing nonexistent wallId rejected (CRITICAL)
test("Opening referencing nonexistent wallId rejected", () => {
  const input = {
    id: "f0",
    level: 0,
    outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
    walls: [{ id: "w1", path: [[0, 0], [10, 0]], thickness: 0.3 }],
    openings: [{ id: "op1", wallId: "w99", positionAlongWall: 0.5, width: 1, type: "door" }],
  };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with nonexistent wallId");
});

// Test 31: Opening in wall within same floor validates
test("Opening in wall within same floor validates", () => {
  const input = {
    id: "f0",
    level: 0,
    outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
    walls: [
      { id: "w1", path: [[0, 0], [10, 0]], thickness: 0.3 },
      { id: "w2", path: [[10, 0], [10, 10]], thickness: 0.3 },
    ],
    openings: [
      { id: "op1", wallId: "w1", positionAlongWall: 0.5, width: 1, type: "door" },
      { id: "op2", wallId: "w2", positionAlongWall: 0.3, width: 0.9, type: "window" },
    ],
  };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, true, `Expected success but got error: ${result.success ? "" : result.error?.message}`);
});

// Test 32: Room count limit enforced (101 rooms)
test("Room count limit enforced (101 rooms)", () => {
  const rooms = Array.from({ length: 101 }, (_, i) => ({
    id: `r${i}`,
    polygon: [[[0, 0], [5, 0], [5, 5], [0, 5]]],
    roomType: "bedroom",
  }));
  const input = {
    id: "f0",
    level: 0,
    outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
    rooms,
  };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with 101 rooms (max 100)");
});

// Test 32b: Wall count limit enforced (201 walls)
test("Wall count limit enforced (201 walls)", () => {
  const walls = Array.from({ length: 201 }, (_, i) => ({
    id: `w${i}`,
    path: [[0, 0], [10, 0]],
    thickness: 0.3,
  }));
  const input = {
    id: "f0",
    level: 0,
    outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
    walls,
  };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with 201 walls (max 200)");
});

// Test 32c: Opening count limit enforced (201 openings)
test("Opening count limit enforced (201 openings)", () => {
  const openings = Array.from({ length: 201 }, (_, i) => ({
    id: `op${i}`,
    wallId: "w1",
    positionAlongWall: 0.5,
    width: 1,
    type: "door",
  }));
  const input = {
    id: "f0",
    level: 0,
    outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
    walls: [{ id: "w1", path: [[0, 0], [10, 0]], thickness: 0.3 }],
    openings,
  };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with 201 openings (max 200)");
});

// Test 33: FloorPlanSpec with ≥1 floor required
test("FloorPlanSpec with ≥1 floor required", () => {
  const input = { floors: [] };
  const result = FloorPlanSpecSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with empty floors array");
});

// Test 34: Floor.level must be ≥ 0
test("Floor.level must be >= 0", () => {
  const input = { id: "f-1", level: -1, outline: [[[0, 0], [10, 0], [10, 10], [0, 10]]] };
  const result = FloorSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with level < 0");
});

// Test 35: Wall.thickness > 0
test("Wall.thickness > 0", () => {
  const input = { id: "w1", path: [[0, 0], [10, 0]], thickness: 0 };
  const result = WallSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with thickness = 0");
});

// Test 36: Wall.thickness < 1000
test("Wall.thickness < 1000", () => {
  const input = { id: "w1", path: [[0, 0], [10, 0]], thickness: 2000 };
  const result = WallSchema.safeParse(input);
  assert.equal(result.success, false, "Expected parse to fail with thickness >= 1000");
});
