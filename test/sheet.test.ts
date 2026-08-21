import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  getLayerId,
  getLayerOrder,
} from "../src/render/layers.js";
import {
  generateTitleBlock,
} from "../src/render/titleblock.js";
import {
  generateSheet,
} from "../src/render/sheet.js";

test("render/layers.ts", async (t) => {
  await t.test("getLayerId: returns valid layer ids", () => {
    const layerId = getLayerId("floor");
    assert(layerId);
  });

  await t.test("getLayerOrder: returns stable order", () => {
    const order = getLayerOrder();
    assert(Array.isArray(order));
    assert(order.length > 0);
  });
});

test("render/titleblock.ts", async (t) => {
  await t.test("generateTitleBlock: returns SVG group with title elements", () => {
    const svg = generateTitleBlock(
      { title: "Test Plan", drawingNumber: "001", date: "2025-01-01", project: "Test" },
      100, 100, 200, 50,
      "blueprint",
      "1:100",
      "m"
    );

    assert(svg.includes("Test Plan"));
    assert(svg.includes("001"));
  });
});

test("render/sheet.ts", async (t) => {
  await t.test("generateSheet: wraps content in <svg> with viewBox and includes passed content", () => {
    const testContent = '<g id="test-layer"><circle cx="50" cy="50" r="10" /></g>';
    const bbox = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    const svg = generateSheet(
      testContent,
      bbox,
      { unit: "m", scale: "1:100" },
      "blueprint"
    );

    assert(svg.includes("<svg"), "Should contain <svg tag");
    assert(svg.includes("viewBox"), "Should contain viewBox");
    assert(svg.includes("</svg>"), "Should close svg");
    assert(svg.includes(testContent), "Should contain the passed content markup");
  });
});
