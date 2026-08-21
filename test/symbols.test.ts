import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  renderDoorSwing,
  renderWindowGlazing,
  renderNorthArrow,
  renderScaleBar,
  renderGridBubble,
  renderDimensionString,
} from "../src/render/symbols.js";

test("render/symbols.ts", async (t) => {
  await t.test("renderDoorSwing: generates SVG with leaf and arc", () => {
    const path = [[50, 50], [50, 150]];
    const svg = renderDoorSwing(
      path,
      0.5, // position
      0.9, // width
      true, // hingeAtStart
      true, // swingRight
      "blueprint"
    );

    assert(svg.includes("<g"), "Should be wrapped in group");
    assert(svg.includes("</g>"), "Should close group");
  });

  await t.test("renderWindowGlazing: generates parallel glazing lines", () => {
    const path = [[0, 0], [0, 100]];
    const svg = renderWindowGlazing(
      path,
      0.5, // position
      0.8, // width
      1.0, // thickness (wall)
      "blueprint"
    );

    assert(svg.includes("<line"), "Should contain line elements");
  });

  await t.test("renderNorthArrow: generates arrow with N label", () => {
    const svg = renderNorthArrow(100, 100, 20, 0, "blueprint");

    assert(svg.includes("N"), "Should contain north label");
    assert(svg.includes("polygon") || svg.includes("line"), "Should have arrow geometry");
  });

  await t.test("renderScaleBar: generates labeled scale bar", () => {
    const svg = renderScaleBar(
      50,
      50,
      100, // length in model units
      "1:100",
      "m",
      "blueprint"
    );

    assert(svg.includes("text"), "Should contain text labels");
    assert(svg.includes("line"), "Should contain line elements");
  });

  await t.test("renderGridBubble: generates circle with label", () => {
    const svg = renderGridBubble(100, 100, "A", 10, "blueprint", "1:100", "m");

    assert(svg.includes("circle"), "Should contain circle");
    assert(svg.includes("A"), "Should contain label");
  });

  await t.test("renderDimensionString: generates dimension line with text", () => {
    const svg = renderDimensionString(
      [0, 0], // from
      [100, 0], // to
      5, // offset
      "m", // unit
      "blueprint", // theme
      "1:100" // scale
    );

    assert(svg.includes("line"), "Should contain dimension line");
    assert(svg.includes("text"), "Should contain text");
  });
});
