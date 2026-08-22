import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRenderFloorPlan } from "../src/tools/renderFloorPlan.js";
import { initializeClipper } from "../src/geometry/clipper.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("renderFloorPlan / Operation 11", async (t) => {
  await initializeClipper();

  await t.test("accepts valid FloorPlanSpec and returns SVG per floor", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      theme: "blueprint",
      floors: [
        {
          id: "floor0",
          level: 0,
          walls: [
            {
              id: "wall1",
              path: [[0, 0], [10, 0]],
              thickness: 0.3,
            },
          ],
          rooms: [
            {
              id: "room1",
              polygon: [[0.15, 0.15], [9.85, 0.15], [9.85, 5], [0.15, 5]],
              roomType: "living",
            },
          ],
        },
      ],
    };

    const result = await handleRenderFloorPlan({ spec });

    if (result.isError) {
      console.error("Error:", result.content[0].text);
    }

    assert(!result.isError, `Should not error: ${result.content?.[0]?.text}`);
    assert(result.content);
    assert(result.content.length > 0, "Should have at least one SVG per floor");

    const svg = result.content[0].text;
    assert(svg.includes("<svg"));
    assert(svg.includes("</svg>"));
  });

  await t.test(
    "CRITICAL: two walls meeting at junction produce one merged poché (no interior seam)",
    async () => {
      const spec = {
        unit: "m",
        scale: "1:100",
        floors: [
          {
            id: "floor0",
            level: 0,
            walls: [
              {
                id: "wall1",
                path: [[0, 5], [10, 5]],
                thickness: 0.4,
              },
              {
                id: "wall2",
                path: [[5, 0], [5, 10]],
                thickness: 0.4,
              },
            ],
          },
        ],
      };

      const result = await handleRenderFloorPlan({ spec });

      assert(!result.isError, `Should not error: ${result.content?.[0]?.text}`);
      const svg = result.content[0].text;

      // CRITICAL ASSERTION: Count polygon/path elements in the A-WALL layer
      // v2 correct behavior (offset→union→cut→stroke): ONE merged poché polygon → ONE <path> in A-WALL
      // v1 bug (per-wall stroking):                    TWO separate outlines → interior seam visible
      const wallLayerMatch = svg.match(/<g id="A-WALL">([\s\S]*?)<\/g>/);
      assert(wallLayerMatch, "A-WALL layer must exist");

      const wallContent = wallLayerMatch[1];
      const pathCount = (wallContent.match(/<path/g) || []).length;

      assert.equal(
        pathCount,
        1,
        `Should have exactly ONE <path> in A-WALL layer (union of two walls), got ${pathCount}. ` +
        "If pathCount === 2, the bug is back: walls are being stroked individually instead of unioned."
      );
    }
  );

  await t.test("renders doors with hinge and swingSide", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      floors: [
        {
          id: "floor0",
          level: 0,
          walls: [
            {
              id: "wall1",
              path: [[0, 0], [10, 0]],
              thickness: 0.3,
            },
          ],
          openings: [
            {
              id: "door1",
              wallId: "wall1",
              positionAlongWall: 0.5,
              width: 0.9,
              type: "door",
              hinge: "start",
              swingSide: "left",
            },
          ],
        },
      ],
    };

    const result = await handleRenderFloorPlan({ spec });

    assert(!result.isError);
    const svg = result.content[0].text;
    assert(svg.includes("A-DOOR") || svg.includes("path") || svg.includes("line"));
  });

  await t.test("renders windows with glazing lines", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      floors: [
        {
          id: "floor0",
          level: 0,
          walls: [
            {
              id: "wall1",
              path: [[0, 0], [10, 0]],
              thickness: 0.3,
            },
          ],
          openings: [
            {
              id: "window1",
              wallId: "wall1",
              positionAlongWall: 0.5,
              width: 1.5,
              type: "window",
            },
          ],
        },
      ],
    };

    const result = await handleRenderFloorPlan({ spec });

    assert(!result.isError);
    const svg = result.content[0].text;
    assert(svg.includes("A-GLAZ") || svg.includes("line"));
  });

  await t.test("multi-floor: one SVG per floor", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      floors: [
        {
          id: "floor0",
          level: 0,
          walls: [
            {
              id: "wall1",
              path: [[0, 0], [10, 0]],
              thickness: 0.3,
            },
          ],
        },
        {
          id: "floor1",
          level: 1,
          walls: [
            {
              id: "wall2",
              path: [[0, 0], [10, 0]],
              thickness: 0.3,
            },
          ],
        },
      ],
    };

    const result = await handleRenderFloorPlan({ spec });

    assert(!result.isError);
    assert.equal(
      result.content.length,
      2,
      "Should return one SVG per floor"
    );
  });

  await t.test("rejects invalid spec", async () => {
    const result = await handleRenderFloorPlan({ spec: "not json" });
    assert(result.isError);
  });

  await t.test("rejects an opening referencing a nonexistent wall (referential integrity)", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      floors: [
        {
          id: "floor0",
          level: 0,
          walls: [
            { id: "wall1", path: [[0, 0], [10, 0]], thickness: 0.3 },
          ],
          openings: [
            {
              id: "ghost-door",
              wallId: "does-not-exist",
              positionAlongWall: 0.5,
              width: 0.9,
              type: "door",
              hinge: "start",
              swingSide: "left",
            },
          ],
        },
      ],
    };

    const result = await handleRenderFloorPlan({ spec });
    assert(result.isError, "Should reject a dangling wallId rather than silently skip it");
    assert(
      result.content[0].text.includes("does-not-exist"),
      "Error should name the offending wallId"
    );
  });

  await t.test("per-wall material: two materials on one floor produce two hatch fills", async () => {
    const spec = {
      unit: "m",
      scale: "1:50",
      floors: [
        {
          id: "floor0",
          level: 0,
          walls: [
            { id: "ext", path: [[0, 0], [10, 0]], thickness: 0.3, material: "brick" },
            { id: "int", path: [[0, 5], [10, 5]], thickness: 0.15, material: "concrete" },
          ],
        },
      ],
    };

    const result = await handleRenderFloorPlan({ spec });
    assert(!result.isError, `Should not error: ${result.content?.[0]?.text}`);
    const svg = result.content[0].text;
    // Both material hatches must be USED as fills (defs always emit every
    // pattern, so assert on url(#...) usage, not mere presence of the def).
    assert(svg.includes("url(#hatch-brick)"), "brick hatch should fill a wall poché");
    assert(svg.includes("url(#hatch-concrete)"), "concrete hatch should fill a wall poché");
  });
});

// Operation 12c: Integration test for two-floor.json example
test("renderFloorPlan / Operation 12: examples/two-floor.json integration", async () => {
  await initializeClipper();

  const examplePath = path.resolve(PROJECT_ROOT, "examples/two-floor.json");
  assert(fs.existsSync(examplePath), `Example file should exist at ${examplePath}`);

  const spec = JSON.parse(fs.readFileSync(examplePath, "utf-8"));

  assert(Array.isArray(spec.floors), "floors should be an array");
  assert.equal(spec.floors.length, 2, "Should have exactly 2 floors");
  assert(spec.floors[0].rooms && spec.floors[0].rooms.length >= 4, "Ground floor should have 4 rooms");
  assert(spec.floors[1].rooms && spec.floors[1].rooms.length >= 4, "First floor should have 4 rooms");

  const result = await handleRenderFloorPlan({ spec });
  assert(!result.isError, `Should not error: ${result.content?.[0]?.text}`);
  assert.equal(result.content.length, 2, "Should return one SVG per floor");

  for (const { text } of result.content) {
    assert(text.startsWith("<svg"), "Each floor's SVG should start with <svg tag");
    assert(text.includes("</svg>"), "Each floor's SVG should end with </svg> tag");
  }

  assert(result.content[0].text.includes("Living Room"), "Ground floor should contain Living Room");
  assert(result.content[0].text.includes("Kitchen"), "Ground floor should contain Kitchen");
});

// Operation 12d: Integration test for house-whiteprint.json example
test("renderFloorPlan / Operation 12: examples/house-whiteprint.json integration", async () => {
  await initializeClipper();

  const examplePath = path.resolve(PROJECT_ROOT, "examples/house-whiteprint.json");
  assert(fs.existsSync(examplePath), `Example file should exist at ${examplePath}`);

  const spec = JSON.parse(fs.readFileSync(examplePath, "utf-8"));

  assert(spec.unit, "Should have unit");
  assert(spec.scale, "Should have scale");
  assert.equal(spec.theme, "whiteprint", "Theme should be whiteprint");
  assert.equal(spec.floors.length, 1, "Should have 1 floor");
  assert(spec.floors[0].rooms && spec.floors[0].rooms.length >= 2, "Should have at least 2 rooms");

  const result = await handleRenderFloorPlan({ spec });
  assert(!result.isError, `Should not error: ${result.content?.[0]?.text}`);
  const text = result.content[0].text;

  assert(text.startsWith("<svg"), "SVG should start with <svg tag");
  assert(text.includes("</svg>"), "SVG should end with </svg> tag");
  assert(text.includes("background-color: #FFFFFF"), "Whiteprint should have a white background");

  // Regression guard for the theme-inverted contrast bug: room labels must be
  // legible text elements, not merely present as markup — the earlier bug
  // (picking `palette.background`, i.e. white, as "contrasting" against a
  // light custom room fill in the whiteprint theme) still produced a <text>
  // element, so presence alone wouldn't have caught it. Assert the label's
  // fill color is not equal to the theme's own background (white), which
  // would be the invisible-text case.
  const labelMatch = text.match(/<text[^>]*fill="([^"]+)"[^>]*>(?:(?!<\/text>)[\s\S])*Living Room/);
  assert(labelMatch, "Should contain a Living Room label with a fill color");
  assert.notEqual(labelMatch![1].toUpperCase(), "#FFFFFF", "Living Room label must not be white-on-white");

  assert(text.includes("Kitchen"), "Should contain Kitchen");
});
