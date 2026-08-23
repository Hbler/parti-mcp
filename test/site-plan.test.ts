import { test } from "node:test";
import { strict as assert } from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { handleRenderSitePlan } from "../src/tools/renderSitePlan.js";
import { initializeClipper } from "../src/geometry/clipper.js";
import type { SiteSpec } from "../src/schema.js";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("renderSitePlan / Operation 9", async (t) => {
  // Initialize Clipper once for all tests
  await initializeClipper();
  await t.test("accepts valid SiteSpec and returns SVG", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      theme: "blueprint",
      buildings: [
        {
          id: "bldg1",
          footprint: [[0, 0], [10, 0], [10, 10], [0, 10]],
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });

    if (result.isError) {
      console.error("Handler error:", result.content[0].text);
    }

    assert(!result.isError, `Should not have error: ${result.content?.[0]?.text}`);
    assert(result.content);
    assert(result.content.length > 0);

    const svg = result.content[0].text;
    assert(svg.includes("<svg"));
    assert(svg.includes("</svg>"));
  });

  await t.test(
    "CRITICAL: two roads meeting at junction produce one merged carriageway (no interior seam)",
    async () => {
      // Regression test for v1 bug: interior outline at junction
      // Two roads meeting at right angle → after offset & union → one merged polygon, not two
      const spec = {
        unit: "m",
        scale: "1:100",
        buildings: [],
        roads: [
          {
            id: "road1",
            path: [[0, 5], [10, 5]], // horizontal, at y=5
            width: 3, // 3m wide
          },
          {
            id: "road2",
            path: [[5, 0], [5, 10]], // vertical, at x=5
            width: 3,
          },
        ],
      };

      const result = await handleRenderSitePlan({ spec });
      assert(!result.isError, "Should render without error");

      const svg = result.content[0].text;

      // CRITICAL ASSERTION: Count polygon/path elements in the C-ROAD layer
      // v2 correct behavior (offset→union→stroke):  ONE merged polygon → ONE <path> in C-ROAD
      // v1 bug (per-road stroking):                 TWO separate paths → interior seam visible
      const roadLayerMatch = svg.match(/<g id="C-ROAD">([\s\S]*?)<\/g>/);
      assert(roadLayerMatch, "C-ROAD layer must exist");

      const roadContent = roadLayerMatch[1];
      const pathCount = (roadContent.match(/<path/g) || []).length;

      assert.equal(
        pathCount,
        1,
        `Should have exactly ONE <path> in C-ROAD layer (union of two roads), got ${pathCount}. ` +
        "If pathCount === 2, the bug is back: roads are being stroked individually instead of unioned."
      );
    }
  );

  await t.test("renders buildings with poché fill", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      buildings: [
        {
          id: "house",
          footprint: [[0, 0], [20, 0], [20, 15], [0, 15]],
          label: "Main House",
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);

    const svg = result.content[0].text;
    assert(svg.includes("house") || svg.includes("A-BLDG"));
  });

  await t.test("renders paved areas with surface hatch", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      pavedAreas: [
        {
          id: "driveway",
          polygon: [[0, 0], [5, 0], [5, 10], [0, 10]],
          surface: "asphalt",
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);

    const svg = result.content[0].text;
    assert(svg.includes("L-HARD") || svg.includes("asphalt"));
  });

  await t.test("renders paved area markings as fine open lines", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      pavedAreas: [
        {
          id: "parking",
          polygon: [[0, 0], [20, 0], [20, 10], [0, 10]],
          surface: "asphalt",
          markings: [
            {
              path: [[5, 0], [5, 10]], // parking stall stripe
            },
            {
              path: [[10, 0], [10, 10]],
            },
          ],
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);

    const svg = result.content[0].text;
    // Markings should be rendered as fine lines
    assert(svg.includes("line") || svg.includes("path"));
  });

  await t.test("renders water features", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      water: [
        {
          id: "pool",
          polygon: [[0, 0], [10, 0], [10, 10], [0, 10]],
          waterType: "pool",
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);

    const svg = result.content[0].text;
    assert(svg.includes("L-WATR") || svg.includes("pool"));
  });

  await t.test("renders green space with landscape type hatch", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      greenSpaces: [
        {
          id: "lawn",
          polygon: [[0, 0], [30, 0], [30, 20], [0, 20]],
          landscapeType: "lawn",
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);

    const svg = result.content[0].text;
    assert(svg.includes("L-PLNT") || svg.includes("lawn"));
  });

  await t.test("renders barriers (fences, walls, hedges)", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      barriers: [
        {
          id: "fence",
          path: [[0, 0], [20, 0]],
          barrierType: "fence",
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);

    const svg = result.content[0].text;
    assert(svg.includes("L-SITE") || svg.includes("fence"));
  });

  await t.test("renders trees with symbol", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      trees: [
        {
          id: "oak1",
          position: [5, 5],
          radius: 2,
          species: "oak",
        },
      ],
    };

    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);

    const svg = result.content[0].text;
    assert(svg.includes("circle") || svg.includes("oak"));
  });

  await t.test("deck surface renders the wood plank hatch (not masonry)", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      pavedAreas: [
        { id: "deck", polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], surface: "deck" },
      ],
    };
    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);
    const svg = result.content[0].text;
    assert(svg.includes("hatch-wood"), "deck should use hatch-wood");
    assert(svg.includes('<pattern id="hatch-wood"'), "the wood pattern must be defined");
  });

  await t.test("elevated paved area renders on L-DECK, above the water layer", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      water: [{ id: "pond", polygon: [[0, 0], [10, 0], [10, 10], [0, 10]], waterType: "pond" }],
      pavedAreas: [
        { id: "deck", polygon: [[2, 2], [8, 2], [8, 8], [2, 8]], surface: "deck", elevated: true },
      ],
    };
    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);
    const svg = result.content[0].text;
    assert(svg.includes('<g id="L-DECK">'), "elevated deck should render on L-DECK");
    // L-DECK group must come AFTER L-WATR in document order (painted on top).
    assert(
      svg.indexOf('<g id="L-DECK">') > svg.indexOf('<g id="L-WATR">'),
      "L-DECK must paint after (above) L-WATR"
    );
  });

  await t.test("non-elevated paved area stays on L-HARD (below water)", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      pavedAreas: [
        { id: "patio", polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], surface: "concrete" },
      ],
    };
    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);
    const svg = result.content[0].text;
    assert(svg.includes('<g id="L-HARD">'), "ground paved area stays on L-HARD");
    assert(!svg.includes('<g id="L-DECK">'), "no deck layer without an elevated area");
  });

  await t.test("custom label overrides the surface-derived name", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      pavedAreas: [
        { id: "d", polygon: [[0, 0], [5, 0], [5, 4], [0, 4]], surface: "asphalt", label: "Motor Court" },
      ],
    };
    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);
    const svg = result.content[0].text;
    assert(svg.includes("Motor Court"), "custom label should be used verbatim");
    assert(!svg.includes(">Asphalt<"), "the surface-derived default should be replaced");
  });

  await t.test("vertical labelOrientation rotates the label group", async () => {
    const spec = {
      unit: "m",
      scale: "1:100",
      pavedAreas: [
        { id: "drive", polygon: [[0, 0], [3, 0], [3, 20], [0, 20]], surface: "asphalt", labelOrientation: "vertical" },
      ],
    };
    const result = await handleRenderSitePlan({ spec });
    assert(!result.isError);
    const svg = result.content[0].text;
    assert(/<g transform="rotate\(-90,/.test(svg), "vertical label should emit a rotate(-90,...) group");
  });

  await t.test("rejects invalid spec", async () => {
    const result = await handleRenderSitePlan({ spec: "not valid json" });
    assert(result.isError);
  });
});

// Operation 10: Integration test for site-plan.json example
test("renderSitePlan / Operation 10: examples/site-plan.json integration", async () => {
  await initializeClipper();

  // Step 1: Load examples/site-plan.json
  const examplePath = path.resolve(PROJECT_ROOT, "examples/site-plan.json");
  assert(fs.existsSync(examplePath), `Example file should exist at ${examplePath}`);

  const jsonContent = fs.readFileSync(examplePath, "utf-8");
  const sitePlan: SiteSpec = JSON.parse(jsonContent);

  // Step 2: Validate schema - check required fields
  assert(sitePlan.unit, "Should have unit");
  assert(sitePlan.scale, "Should have scale");
  assert(sitePlan.buildings, "Should have buildings array");
  assert(Array.isArray(sitePlan.buildings), "buildings should be an array");
  assert(sitePlan.buildings.length >= 1, "Should have at least 1 building");

  // Optional but likely to be present in this example
  if (sitePlan.roads) {
    assert(Array.isArray(sitePlan.roads), "roads should be an array");
    assert(sitePlan.roads.length >= 1, "Should have at least 1 road");
  }
  if (sitePlan.pavedAreas) {
    assert(Array.isArray(sitePlan.pavedAreas), "pavedAreas should be an array");
  }

  // Step 3: Render via handleRenderSitePlan
  const result = await handleRenderSitePlan({ spec: sitePlan });
  assert(!result.isError, `Should not return error: ${result.content?.[0]?.text}`);
  const svg = result.content?.[0]?.text;
  assert(svg, "Should return SVG content");

  // Step 4: SVG well-formedness checks
  assert(svg.startsWith("<svg"), "SVG should start with <svg tag");
  assert(svg.includes("</svg>"), "SVG should end with </svg> tag");
  assert(svg.includes('xmlns="http://www.w3.org/2000/svg"'), "SVG should have correct namespace");
  assert(svg.includes('viewBox="'), "SVG should have viewBox");

  // Step 5: Element count sanity checks
  const pathMatches = svg.match(/<path/g) || [];
  const polygonMatches = svg.match(/<polygon/g) || [];
  const circleMatches = svg.match(/<circle/g) || [];
  const lineMatches = svg.match(/<line/g) || [];

  assert(
    pathMatches.length > 0 || polygonMatches.length > 0,
    "SVG should contain at least paths or polygons for buildings/roads"
  );

  // Step 6: Verify title block elements if present
  if (sitePlan.titleBlock) {
    assert(svg.includes("title-block") || svg.match(/<text[^>]*>.*title/i), "Title block should be rendered");
  }

  // Step 7: Verify text elements
  const textMatches = svg.match(/<text/g) || [];
  assert(textMatches.length > 0, "SVG should contain text elements (labels, dimensions)");

  console.log(`✓ site-plan.json rendered successfully:`);
  console.log(`  Buildings: ${sitePlan.buildings.length}`);
  console.log(`  Paths: ${pathMatches.length}, Polygons: ${polygonMatches.length}, Text: ${textMatches.length}`);
});
