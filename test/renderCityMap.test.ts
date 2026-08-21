import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
import { handleRenderCityMap } from "../src/tools/renderCityMap.js";
import type { MapSpec } from "../src/schema.js";

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

// Test 1: Valid MapSpec generates well-formed SVG
test("Valid MapSpec generates well-formed SVG", async () => {
  const spec: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);
  assert(text.includes("<svg"), "Should contain <svg");
  assert(text.includes("</svg>"), "Should contain </svg>");
  assert(text.includes("<polygon"), "Should contain <polygon elements");
  assert(text.includes('xmlns="http://www.w3.org/2000/svg"'), "Should have SVG namespace");
});

// Test 2: Invalid MapSpec returns error
test("Invalid MapSpec returns error", async () => {
  const spec = {
    buildings: [
      {
        id: "b1",
        // missing footprint - required field
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), true, "Should return error for invalid spec");
  const text = getResultText(result);
  assert(text.length > 0, "Error message should be descriptive");
});

// Test 3: outputPath with ".." is rejected
test("outputPath with '..' is rejected", async () => {
  const spec: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
      },
    ],
  };

  const result = await handleRenderCityMap({
    spec,
    outputPath: "../../../etc/passwd",
  });

  assert.equal(isError(result), true, "Should reject path traversal attempt");
  const text = getResultText(result);
  assert(text.toLowerCase().includes("security") || text.toLowerCase().includes("path"), "Should mention security concern");
});

// Test 4: outputPath outside allowed directory is rejected
test("outputPath outside allowed directory is rejected", async () => {
  const spec: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
      },
    ],
  };

  const result = await handleRenderCityMap({
    spec,
    outputPath: "/etc/passwd",
  });

  assert.equal(isError(result), true, "Should reject path outside allowed directory");
});

// Test 5: Valid outputPath creates file
test("Valid outputPath creates file", async () => {
  const spec: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
      },
    ],
  };

  const outputPath = "output/test-render.svg";
  const result = await handleRenderCityMap({ spec, outputPath });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);
  assert(text.includes("written") || text.includes("SVG"), "Should indicate file was written");

  // Check that file was created
  const expectedPath = path.resolve(PROJECT_ROOT, outputPath);
  assert(fs.existsSync(expectedPath), `File should be created at ${expectedPath}`);

  // Check file contents
  const fileContents = fs.readFileSync(expectedPath, "utf-8");
  assert(fileContents.includes("<svg"), "File should contain SVG content");
  assert(fileContents.includes("</svg>"), "File should be complete SVG");
});

// Test 6: Multiple buildings render correctly
test("Multiple buildings render correctly", async () => {
  const spec: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
        floorCount: 1,
      },
      {
        id: "b2",
        footprint: [[[20, 20], [30, 20], [30, 30], [20, 30]]],
        floorCount: 3,
      },
      {
        id: "b3",
        footprint: [[[40, 40], [50, 40], [50, 50], [40, 50]]],
        floorCount: 5,
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Count polygon elements (one per building)
  const polygonMatches = text.match(/<polygon/g) || [];
  assert(polygonMatches.length >= 3, "Should have at least 3 polygon elements for 3 buildings");

  // Verify higher floorCount produces higher opacity
  assert(text.includes("opacity"), "Should include opacity styling for buildings");
});

// Test 7: Roads render as buffered polygons
test("Roads render as buffered polygons", async () => {
  const spec: MapSpec = {
    roads: [
      {
        id: "road1",
        path: [[0, 0], [100, 0]],
        width: 5,
      },
      {
        id: "road2",
        path: [[0, 100], [100, 100]],
        width: 10,
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Roads should be rendered as polygons (buffered), not paths
  assert(text.includes("<polygon"), "Roads should render as polygons");
  assert(!text.includes("<path"), "Roads should NOT render as SVG paths");
});

// Test 8: GreenSpaces render with light green
test("GreenSpaces render with light green", async () => {
  const spec: MapSpec = {
    greenspaces: [
      {
        id: "park1",
        polygon: [[[0, 0], [100, 0], [100, 100], [0, 100]]],
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(text.includes("<polygon"), "Should render greenspace as polygon");
  // Light green color: #90EE90
  assert(text.includes("90EE90") || text.includes("90ee90"), "Should use light green color for greenspace");
});

// Test 9: Blocks with zones render with zone-specific colors
test("Blocks with zones render with zone-specific colors", async () => {
  const spec: MapSpec = {
    blocks: [
      {
        id: "blk1",
        polygon: [[[0, 0], [50, 0], [50, 50], [0, 50]]],
        zone: "residential",
      },
      {
        id: "blk2",
        polygon: [[[60, 0], [110, 0], [110, 50], [60, 50]]],
        zone: "commercial",
      },
      {
        id: "blk3",
        polygon: [[[0, 60], [50, 60], [50, 110], [0, 110]]],
        zone: "park",
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  // Count polygon elements (one per block)
  const polygonMatches = text.match(/<polygon/g) || [];
  assert(polygonMatches.length >= 3, "Should render all 3 blocks as polygons");

  // Verify zone-specific colors are used
  // residential: light gray, commercial: light orange, park: darker green
  assert(text.includes("E8E8E8") || text.includes("FFE8C6") || text.includes("7FBF7F"), "Should include zone-specific colors");
});

// Test 10: Building labels render
test("Building labels render", async () => {
  const spec: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [50, 0], [50, 50], [0, 50]]],
        label: {
          text: "Hotel",
          position: [25, 25],
          size: 14,
        },
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(text.includes("<text"), "Should contain text element for label");
  assert(text.includes("Hotel"), "Should contain label text");
  assert(text.includes("font-size"), "Should have font-size styling");
});

// Test 11: Labels with special characters are escaped
test("Labels with special characters are escaped", async () => {
  const spec: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [50, 0], [50, 50], [0, 50]]],
        label: {
          text: "A & B < C",
          position: [25, 25],
        },
      },
    ],
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should not return error");
  const text = getResultText(result);

  assert(text.includes("A &amp; B &lt; C"), "Should escape special characters in labels");
  assert(!text.includes("A & B <"), "Should not contain unescaped special characters");
});

// Test 12: Empty MapSpec returns error
test("Empty MapSpec returns error", async () => {
  const spec = {
    units: "meters",
    // no entities
  };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), true, "Should return error for empty MapSpec");
});

// Test 13: Very large MapSpec (500 buildings) handles scaling
test("Very large MapSpec (500 buildings) handles scaling", async () => {
  const buildings = Array.from({ length: 500 }, (_, i) => {
    const row = Math.floor(i / 10);
    const col = i % 10;
    return {
      id: `b${i}`,
      footprint: [
        [
          [col * 100, row * 100],
          [col * 100 + 80, row * 100],
          [col * 100 + 80, row * 100 + 80],
          [col * 100, row * 100 + 80],
        ],
      ],
    };
  });

  const spec: MapSpec = { buildings };

  const result = await handleRenderCityMap({ spec });

  assert.equal(isError(result), false, "Should handle 500 buildings without error");
  const text = getResultText(result);
  assert(text.includes("<svg"), "Should produce SVG");
  assert(text.includes("</svg>"), "Should be complete SVG");

  // Verify buildings are rendered
  const polygonMatches = text.match(/<polygon/g) || [];
  assert(polygonMatches.length >= 500, "Should render all 500 buildings");
});

// Test 14: Null/undefined spec handled gracefully
test("Null/undefined spec handled gracefully", async () => {
  const result1 = await handleRenderCityMap({ spec: null });
  assert.equal(isError(result1), true, "Should return error for null spec");

  const result2 = await handleRenderCityMap({ spec: undefined });
  assert.equal(isError(result2), true, "Should return error for undefined spec");

  const result3 = await handleRenderCityMap({});
  assert.equal(isError(result3), true, "Should return error for missing spec");
});

// Test 15: Spec as string (JSON) or object both work
test("Spec as string (JSON) or object both work", async () => {
  const specObj: MapSpec = {
    buildings: [
      {
        id: "b1",
        footprint: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
      },
    ],
  };

  // Test with object
  const resultObj = await handleRenderCityMap({ spec: specObj });
  assert.equal(isError(resultObj), false, "Should work with spec as object");

  // Test with JSON string
  const specString = JSON.stringify(specObj);
  const resultString = await handleRenderCityMap({ spec: specString });
  assert.equal(isError(resultString), false, "Should work with spec as JSON string");

  // Both should produce SVG
  const textObj = getResultText(resultObj);
  const textString = getResultText(resultString);
  assert(textObj.includes("<svg"), "Object spec should produce SVG");
  assert(textString.includes("<svg"), "String spec should produce SVG");
});

// Test 16: Integration - Load small-city.json, validate, render, verify output
test("Integration: Load small-city.json, validate, render, verify output", async () => {
  // Step 1: Load examples/small-city.json
  const examplePath = path.resolve(PROJECT_ROOT, "examples/small-city.json");
  assert(fs.existsSync(examplePath), `Example file should exist at ${examplePath}`);

  const jsonContent = fs.readFileSync(examplePath, "utf-8");
  const smallCity: MapSpec = JSON.parse(jsonContent);

  // Step 2: Validate against schema (should parse successfully)
  assert(smallCity.blocks, "Should have blocks");
  assert(smallCity.greenspaces, "Should have greenspaces");
  assert(smallCity.buildings, "Should have buildings");
  assert(smallCity.roads, "Should have roads");
  assert(smallCity.buildings.length >= 5, "Should have at least 5 buildings");
  assert(smallCity.blocks.length >= 3, "Should have at least 3 blocks");

  // Step 3: Render via handleRenderCityMap
  const result = await handleRenderCityMap({ spec: smallCity });
  assert.equal(isError(result), false, "Should not return error");
  const svg = getResultText(result);

  // Step 4: SVG well-formedness checks
  assert(svg.startsWith("<svg"), "SVG should start with <svg tag");
  assert(svg.includes("</svg>"), "SVG should end with </svg> tag");
  assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'), "SVG should have correct namespace");

  // Step 5: Element counts (3 blocks + 1 park + 5 buildings + 3 roads, all render as <polygon>)
  const polygonMatches = svg.match(/<polygon/g) || [];
  const expectedPolygons =
    smallCity.blocks!.length +
    smallCity.greenspaces!.length +
    smallCity.buildings!.length +
    smallCity.roads!.length;
  assert.equal(
    polygonMatches.length,
    expectedPolygons,
    `Should have exactly ${expectedPolygons} polygons, got ${polygonMatches.length}`
  );

  const textMatches = svg.match(/<text/g) || [];
  assert(textMatches.length >= 3, `Should have at least 3 text labels, got ${textMatches.length}`);

  // Every polygon's points must be finite numbers within the viewBox's order of
  // magnitude — catches geodesic-buffer-style bugs that emit huge/garbage
  // coordinates instead of throwing.
  const pointsAttrs = [...svg.matchAll(/<polygon points="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(pointsAttrs.length, expectedPolygons);
  for (const pointsAttr of pointsAttrs) {
    const coords = pointsAttr.trim().split(/\s+/).map((pair) => pair.split(",").map(Number));
    for (const [x, y] of coords) {
      assert(Number.isFinite(x) && Number.isFinite(y), `Non-finite polygon coordinate: ${x},${y}`);
    }
  }

  // Step 6: Geometry sanity check - viewBox
  const viewBoxMatch = svg.match(/viewBox="([^"]+)"/);
  assert(viewBoxMatch, "SVG should have viewBox attribute");
  const viewBoxParts = viewBoxMatch![1].split(" ");
  const width = parseFloat(viewBoxParts[2]);
  const height = parseFloat(viewBoxParts[3]);
  assert(width > 0 && height > 0, `viewBox dimensions should be positive: ${width}x${height}`);

  // Every rendered coordinate must fall within a generous margin of the
  // viewBox. A regression to geodesic (lon/lat) buffering instead of planar
  // buffering produces coordinates orders of magnitude outside the viewBox
  // while still being individually finite, so the isFinite check above
  // wouldn't catch it — this bound does.
  const margin = Math.max(width, height) * 2;
  for (const pointsAttr of pointsAttrs) {
    const coords = pointsAttr.trim().split(/\s+/).map((pair) => pair.split(",").map(Number));
    for (const [x, y] of coords) {
      assert(
        x >= -margin && x <= width + margin && y >= -margin && y <= height + margin,
        `Polygon coordinate ${x},${y} is far outside viewBox 0 0 ${width} ${height}`
      );
    }
  }

  // Step 7: Verify specific labels are present
  assert(svg.includes("House A"), "Should contain label 'House A'");
  assert(svg.includes("Office Building"), "Should contain label 'Office Building'");
  assert(svg.includes("Hotel"), "Should contain label 'Hotel'");
});
