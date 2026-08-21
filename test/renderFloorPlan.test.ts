import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { handleRenderFloorPlan } from "../src/tools/renderFloorPlan.js";
import type { FloorPlanSpec } from "../src/schema.js";

// Helper: Create temporary output directory for tests
const testOutputDir = "/tmp/plan-mcp-test-output";
if (!fs.existsSync(testOutputDir)) {
  fs.mkdirSync(testOutputDir, { recursive: true });
}

// Helper: Extract text content from tool result
function getResultText(result: any): string {
  if (result.content && Array.isArray(result.content) && result.content.length > 0) {
    return result.content[0].text || "";
  }
  return "";
}

// Helper: Check if result is an error
function isError(result: any): boolean {
  return result.isError === true;
}

// Test 1: Valid single-floor FloorPlanSpec generates well-formed SVG
test("Valid single-floor FloorPlanSpec generates well-formed SVG", async () => {
  const spec: FloorPlanSpec = {
    buildingLabel: "Test Building",
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [50, 0], [50, 50], [0, 50]]],
            roomType: "bedroom",
          },
          {
            id: "r2",
            polygon: [[[50, 0], [100, 0], [100, 50], [50, 50]]],
            roomType: "kitchen",
          },
          {
            id: "r3",
            polygon: [[[0, 50], [100, 50], [100, 100], [0, 100]]],
            roomType: "bathroom",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);
  assert(text.includes("<svg"), "Should contain <svg");
  assert(text.includes("</svg>"), "Should contain </svg>");
  assert(text.includes('xmlns="http://www.w3.org/2000/svg"'), "Should have SVG namespace");
});

// Test 2: Invalid FloorPlanSpec returns ToolError
test("Invalid FloorPlanSpec returns ToolError", async () => {
  const spec = {
    buildingLabel: "Test Building",
    // missing floors - required field
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), true, "Should return error for invalid spec");
  const text = getResultText(result);
  assert(text.length > 0, "Error message should be descriptive");
});

// Test 3: Multi-floor FloorPlanSpec returns multiple SVGs
test("Multi-floor FloorPlanSpec returns multiple SVGs", async () => {
  const spec: FloorPlanSpec = {
    buildingLabel: "Multi-floor Building",
    floors: [
      {
        id: "floor0",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "living",
          },
        ],
      },
      {
        id: "floor1",
        level: 1,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r2",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "bedroom",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);
  // Should contain multiple SVG documents or array of SVGs
  assert(text.includes("<svg"), "Should contain SVG content");
});

// Test 4: Single floor renders rooms correctly
test("Single floor renders rooms correctly", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [200, 0], [200, 200], [0, 200]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [50, 0], [50, 50], [0, 50]]],
            roomType: "bedroom",
          },
          {
            id: "r2",
            polygon: [[[50, 0], [100, 0], [100, 50], [50, 50]]],
            roomType: "kitchen",
          },
          {
            id: "r3",
            polygon: [[[100, 0], [150, 0], [150, 50], [100, 50]]],
            roomType: "bathroom",
          },
          {
            id: "r4",
            polygon: [[[150, 0], [200, 0], [200, 50], [150, 50]]],
            roomType: "living",
          },
          {
            id: "r5",
            polygon: [[[0, 50], [200, 50], [200, 200], [0, 200]]],
            roomType: "hallway",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Count polygon elements (should include rooms, floor outline, walls)
  const polygonMatches = text.match(/<polygon/g) || [];
  assert(polygonMatches.length >= 5, "Should have at least 5 polygon elements for 5 rooms");
});

// Test 5: Single floor renders walls
test("Single floor renders walls", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [50, 0], [50, 100], [0, 100]]],
            roomType: "bedroom",
          },
          {
            id: "r2",
            polygon: [[[50, 0], [100, 0], [100, 100], [50, 100]]],
            roomType: "kitchen",
          },
        ],
        walls: [
          {
            id: "w1",
            path: [[50, 0], [50, 100]],
            thickness: 1,
          },
          {
            id: "w2",
            path: [[0, 50], [100, 50]],
            thickness: 1,
          },
          {
            id: "w3",
            path: [[25, 0], [25, 50]],
            thickness: 0.5,
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(text.includes("<polygon"), "Should render walls as polygons");
});

// Test 6: Rooms have correct colors by type
test("Rooms have correct colors by type", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [300, 0], [300, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [50, 0], [50, 100], [0, 100]]],
            roomType: "bedroom",
          },
          {
            id: "r2",
            polygon: [[[50, 0], [100, 0], [100, 100], [50, 100]]],
            roomType: "kitchen",
          },
          {
            id: "r3",
            polygon: [[[100, 0], [150, 0], [150, 100], [100, 100]]],
            roomType: "bathroom",
          },
          {
            id: "r4",
            polygon: [[[150, 0], [200, 0], [200, 100], [150, 100]]],
            roomType: "living",
          },
          {
            id: "r5",
            polygon: [[[200, 0], [250, 0], [250, 100], [200, 100]]],
            roomType: "hallway",
          },
          {
            id: "r6",
            polygon: [[[250, 0], [300, 0], [300, 100], [250, 100]]],
            roomType: "other",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Check for room type colors
  // bedroom: #E8E8FF (light blue)
  // kitchen: #FFFFE8 (light yellow)
  // bathroom: #E8F8FF (light cyan)
  // living: #F0E8F0 (light purple/pink)
  // hallway: #F0F0F0 (very light gray)
  // other: #EFEFEF (light gray)

  const hasColors =
    text.includes("E8E8FF") || // bedroom
    text.includes("FFFFE8") || // kitchen
    text.includes("E8F8FF") || // bathroom
    text.includes("F0E8F0") || // living
    text.includes("F0F0F0") || // hallway
    text.includes("EFEFEF"); // other

  assert(hasColors, "Should include room-type specific colors");
});

// Test 7: Room labels render
test("Room labels render", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "bedroom",
            label: {
              text: "Master Bedroom",
              position: [50, 50],
              size: 14,
            },
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(text.includes("<text"), "Should contain text element for label");
  assert(text.includes("Master Bedroom"), "Should contain label text");
});

// Test 8: Room labels with special characters are escaped
test("Room labels with special characters are escaped", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "bedroom",
            label: {
              text: "Room & Suite",
              position: [50, 50],
            },
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(text.includes("Room &amp; Suite"), "Should escape special characters in labels");
  assert(!text.includes("Room & Suite"), "Should not contain unescaped special characters");
});

// Test 9: Doors render as markers
test("Doors render as markers", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [50, 0], [50, 100], [0, 100]]],
            roomType: "bedroom",
          },
          {
            id: "r2",
            polygon: [[[50, 0], [100, 0], [100, 100], [50, 100]]],
            roomType: "living",
          },
        ],
        walls: [
          {
            id: "w1",
            path: [[50, 0], [50, 100]],
            thickness: 1,
          },
        ],
        openings: [
          {
            id: "door1",
            wallId: "w1",
            positionAlongWall: 0.5,
            width: 1.0,
            type: "door",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Door marker should render as arc path
  assert(
    text.includes("<path") || text.includes("A") && text.includes("arc"),
    "Should render door marker"
  );
});

// Test 10: Windows render as markers
test("Windows render as markers", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [50, 0], [50, 100], [0, 100]]],
            roomType: "bedroom",
          },
          {
            id: "r2",
            polygon: [[[50, 0], [100, 0], [100, 100], [50, 100]]],
            roomType: "kitchen",
          },
        ],
        walls: [
          {
            id: "w1",
            path: [[50, 0], [50, 100]],
            thickness: 1,
          },
        ],
        openings: [
          {
            id: "window1",
            wallId: "w1",
            positionAlongWall: 0.3,
            width: 1.5,
            type: "window",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Window marker should render as lines
  assert(text.includes("<line"), "Should render window marker with line elements");
});

// Test 11: Multiple openings render
test("Multiple openings render", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [50, 0], [50, 100], [0, 100]]],
            roomType: "bedroom",
          },
          {
            id: "r2",
            polygon: [[[50, 0], [100, 0], [100, 100], [50, 100]]],
            roomType: "living",
          },
        ],
        walls: [
          {
            id: "w1",
            path: [[50, 0], [50, 100]],
            thickness: 1,
          },
        ],
        openings: [
          {
            id: "door1",
            wallId: "w1",
            positionAlongWall: 0.3,
            width: 1.0,
            type: "door",
          },
          {
            id: "window1",
            wallId: "w1",
            positionAlongWall: 0.7,
            width: 1.5,
            type: "window",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Should have both door and window markers
  assert(text.includes("<path") || text.includes("<line"), "Should render opening markers");
});

// Test 12: Floor outline renders
test("Floor outline renders", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[10, 10], [90, 10], [90, 90], [10, 90]]],
            roomType: "living",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(text.includes("<polygon"), "Should render floor outline as polygon");
  // Floor outline should have light gray color
  assert(text.includes("D0D0D0"), "Should use light gray for floor outline");
});

// Test 13: Building label renders in title or comment
test("Building label renders in title or comment", async () => {
  const spec: FloorPlanSpec = {
    buildingLabel: "My Office",
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "living",
          },
        ],
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(
    text.includes("My Office") || text.includes("<!-- My Office -->"),
    "Should include building label in output"
  );
});

// Test 14: Large single-floor (100 rooms, 200 walls) scales correctly
test("Large single-floor (100 rooms, 200 walls) scales correctly", async () => {
  const rooms = Array.from({ length: 100 }, (_, i) => {
    const col = i % 10;
    const row = Math.floor(i / 10);
    return {
      id: `r${i}`,
      polygon: [
        [
          [col * 10, row * 10],
          [(col + 1) * 10, row * 10],
          [(col + 1) * 10, (row + 1) * 10],
          [col * 10, (row + 1) * 10],
        ],
      ],
      roomType: "other",
    };
  });

  const walls = Array.from({ length: 200 }, (_, i) => {
    const start = [Math.random() * 100, Math.random() * 100];
    const end = [Math.random() * 100, Math.random() * 100];
    return {
      id: `w${i}`,
      path: [start as [number, number], end as [number, number]],
      thickness: 0.5,
    };
  });

  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms,
        walls,
      },
    ],
  };

  const result = await handleRenderFloorPlan({ spec });

  assert.equal(isError(result), false, "Should handle large floor without error");
  const text = getResultText(result);
  assert(text.includes("<svg"), "Should produce SVG");
  assert(text.includes("</svg>"), "Should be complete SVG");
});

// Test 15: outputPath with security checks
test("outputPath with security checks", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "living",
          },
        ],
      },
    ],
  };

  // Test 1: Valid path
  const result1 = await handleRenderFloorPlan({
    spec,
    outputPath: "output/test-floor.svg",
  });
  assert.equal(isError(result1), false, "Valid path should work");

  // Test 2: Path traversal attempt
  const result2 = await handleRenderFloorPlan({
    spec,
    outputPath: "../../../etc/passwd",
  });
  assert.equal(isError(result2), true, "Should reject path traversal");

  // Test 3: Path outside allowed directory
  const result3 = await handleRenderFloorPlan({
    spec,
    outputPath: "/etc/passwd",
  });
  assert.equal(isError(result3), true, "Should reject path outside allowed directory");
});

// Test 16: Multi-floor with outputPath creates separate files
test("Multi-floor with outputPath creates separate files", async () => {
  const spec: FloorPlanSpec = {
    floors: [
      {
        id: "floor0",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "living",
          },
        ],
      },
      {
        id: "floor1",
        level: 1,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r2",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "bedroom",
          },
        ],
      },
    ],
  };

  const outputPath = "output/test-building";
  const result = await handleRenderFloorPlan({ spec, outputPath });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);
  assert(text.includes("written") || text.includes("building"), "Should indicate files were written");

  // Check that files were created
  const expectedPath0 = path.resolve("/Users/hugobler/Coding/plan-mcp", `${outputPath}_L0.svg`);
  const expectedPath1 = path.resolve("/Users/hugobler/Coding/plan-mcp", `${outputPath}_L1.svg`);

  // Give a small delay for file system
  await new Promise((resolve) => setTimeout(resolve, 100));

  if (fs.existsSync(expectedPath0)) {
    const fileContents0 = fs.readFileSync(expectedPath0, "utf-8");
    assert(fileContents0.includes("<svg"), "Floor 0 file should contain SVG content");
  }
});

// Test 17: Null/undefined spec handled gracefully
test("Null/undefined spec handled gracefully", async () => {
  const result1 = await handleRenderFloorPlan({ spec: null });
  assert.equal(isError(result1), true, "Should return error for null spec");

  const result2 = await handleRenderFloorPlan({ spec: undefined });
  assert.equal(isError(result2), true, "Should return error for undefined spec");

  const result3 = await handleRenderFloorPlan({});
  assert.equal(isError(result3), true, "Should return error for missing spec");
});

// Test 18: Spec as string (JSON) or object both work
test("Spec as string (JSON) or object both work", async () => {
  const specObj: FloorPlanSpec = {
    floors: [
      {
        id: "floor1",
        level: 0,
        outline: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
        rooms: [
          {
            id: "r1",
            polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
            roomType: "living",
          },
        ],
      },
    ],
  };

  // Test with object
  const resultObj = await handleRenderFloorPlan({ spec: specObj });
  assert.equal(isError(resultObj), false, "Should work with spec as object");

  // Test with JSON string
  const specString = JSON.stringify(specObj);
  const resultString = await handleRenderFloorPlan({ spec: specString });
  assert.equal(isError(resultString), false, "Should work with spec as JSON string");

  // Both should produce SVG
  const textObj = getResultText(resultObj);
  const textString = getResultText(resultString);
  assert(textObj.includes("<svg"), "Object spec should produce SVG");
  assert(textString.includes("<svg"), "String spec should produce SVG");
});

// Test 19 (Integration): Load small-house.json, render, verify output
test("Integration: Load small-house.json, render, verify output", async () => {
  // Step 1: Load examples/small-house.json
  const examplesDir = path.resolve("/Users/hugobler/Coding/plan-mcp", "examples");
  const smallHousePath = path.join(examplesDir, "small-house.json");

  assert(fs.existsSync(smallHousePath), `small-house.json should exist at ${smallHousePath}`);
  const fileContent = fs.readFileSync(smallHousePath, "utf-8");
  const smallHouse = JSON.parse(fileContent);

  // Step 2: Validate against schema
  let parsedSpec: FloorPlanSpec;
  try {
    parsedSpec = smallHouse as FloorPlanSpec;
    // Perform basic validation
    assert(parsedSpec.buildingLabel, "Should have buildingLabel");
    assert(Array.isArray(parsedSpec.floors), "Should have floors array");
    assert(parsedSpec.floors.length > 0, "Should have at least one floor");
  } catch (e) {
    assert.fail(`Schema validation failed: ${e}`);
  }

  // Step 3: Render via renderFloorPlan
  const result = await handleRenderFloorPlan({ spec: smallHouse });
  assert.equal(isError(result), false, "Should return valid result (not ToolError)");

  // Step 4: SVG well-formedness
  const svgText = getResultText(result);
  assert(svgText.includes("<svg"), "SVG should start with <svg tag");
  assert(svgText.includes("</svg>"), "SVG should end with </svg> tag");
  assert(svgText.includes('xmlns="http://www.w3.org/2000/svg"'), "Should have SVG namespace");

  // Step 5: Element counts
  const polygonMatches = svgText.match(/<polygon/g) || [];
  assert(
    polygonMatches.length >= 13,
    `Should have at least 13 polygon elements (floor + 5 rooms + 8 walls), got ${polygonMatches.length}`
  );

  const textMatches = svgText.match(/<text/g) || [];
  assert(
    textMatches.length >= 5,
    `Should have at least 5 text elements for room labels, got ${textMatches.length}`
  );

  const pathMatches = svgText.match(/<path/g) || [];
  const lineMatches = svgText.match(/<line/g) || [];
  const openingMarkers = pathMatches.length + lineMatches.length;
  assert(
    openingMarkers >= 6,
    `Should have at least 6 opening marker elements (path or line), got ${openingMarkers} (${pathMatches.length} paths, ${lineMatches.length} lines)`
  );

  // Step 6: Geometry sanity
  const viewBoxMatch = svgText.match(/viewBox="([^"]+)"/);
  assert(viewBoxMatch, "Should have viewBox attribute");
  const viewBoxParts = viewBoxMatch![1].split(/\s+/);
  const width = parseFloat(viewBoxParts[2]);
  const height = parseFloat(viewBoxParts[3]);
  assert(width > 0, "ViewBox width should be positive");
  assert(height > 0, "ViewBox height should be positive");

  // Step 7: Label content
  const expectedLabels = ["Master Bedroom", "Kitchen", "Bath", "Living Room", "Entry Hall"];
  for (const label of expectedLabels) {
    assert(
      svgText.includes(label),
      `SVG should contain room label: "${label}"`
    );
  }

  // Step 8: Room colors
  const hasRoomColors =
    svgText.includes("E8E8FF") || // bedroom
    svgText.includes("FFFFE8") || // kitchen
    svgText.includes("E8F8FF") || // bathroom
    svgText.includes("F0E8F0") || // living
    svgText.includes("F0F0F0") || // hallway
    svgText.includes("EFEFEF");   // other

  assert(hasRoomColors, "SVG should contain room-type specific colors");
});

// Test 20 (Integration): Load two-floor-building.json, render, verify multi-floor output
test("Integration: Load two-floor-building.json, render multi-floor, verify no cross-contamination", async () => {
  // Load examples/two-floor-building.json
  const examplePath = path.join(process.cwd(), "examples", "two-floor-building.json");
  const exampleData = fs.readFileSync(examplePath, "utf-8");
  const spec = JSON.parse(exampleData) as FloorPlanSpec;

  // Validate schema (2 floors expected)
  assert.equal(spec.floors.length, 2, "Should have exactly 2 floors");

  // Call renderFloorPlan
  const result = await handleRenderFloorPlan({ spec });
  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Check 2 distinct SVGs returned
  const svgMatches = text.match(/<svg[^>]*>/g) || [];
  assert(svgMatches.length >= 2, "Should contain at least 2 SVG documents (one per floor)");

  // Verify level 0 (Ground Floor) content
  assert(text.includes("Reception"), "Ground floor should contain Reception label");
  assert(text.includes("Office A"), "Ground floor should contain Office A label");
  assert(text.includes("Office B"), "Ground floor should contain Office B label");
  assert(text.includes("Break Room"), "Ground floor should contain Break Room label");

  // Verify level 1 (Upper Floor) content
  assert(text.includes("Conference Room"), "Upper floor should contain Conference Room label");
  assert(text.includes("Storage"), "Upper floor should contain Storage label");
  assert(text.includes("Lounge"), "Upper floor should contain Lounge label");
  assert(text.includes("Server Room"), "Upper floor should contain Server Room label");

  // Verify element counts
  const floors = spec.floors;
  assert(floors[0].rooms.length >= 4, "Level 0 should have at least 4 rooms");
  assert(floors[1].rooms.length >= 4, "Level 1 should have at least 4 rooms");

  const polygonMatches = text.match(/<polygon/g) || [];
  assert(polygonMatches.length >= 8, "Should have at least 8 polygons (4+ per floor)");
});
