import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  getTheme,
  getLineweight,
  getLinetype,
  resolveColor,
} from "../src/render/theme.js";
import {
  formatNumber,
  escapeXml,
  estimateTextWidth,
  polygonToSvg,
  polylineToSvg,
} from "../src/render/primitives.js";
import { generateDefs } from "../src/render/defs.js";

test("render/theme.ts", async (t) => {
  await t.test("getTheme: blueprint palette", () => {
    const theme = getTheme("blueprint");
    assert(theme.background);
    assert(theme.ink);
    assert(theme.pochéFill);
    // Blueprint is blue/light
  });

  await t.test("getTheme: whiteprint palette", () => {
    const theme = getTheme("whiteprint");
    assert(theme.background);
    assert(theme.ink);
    assert(theme.pochéFill);
    // Whiteprint is white/black
  });

  await t.test("getLineweight: converts role to paper-mm", () => {
    const heavy = getLineweight("heavy", "1:100", "m");
    const medium = getLineweight("medium", "1:100", "m");
    const light = getLineweight("light", "1:100", "m");

    assert(heavy > medium, "Heavy should be wider than medium");
    assert(medium > light, "Medium should be wider than light");
  });

  await t.test("getLinetype: returns dasharray for dashed/dashdot", () => {
    const solid = getLinetype("solid", "1:100", "m");
    const dashed = getLinetype("dashed", "1:100", "m");
    const dashdot = getLinetype("dashdot", "1:100", "m");

    assert.equal(solid, undefined, "Solid has no dasharray");
    assert(dashed, "Dashed should have dasharray");
    assert(dashdot, "Dashdot should have dasharray");
  });

  await t.test("resolveColor: returns safe colors unchanged", () => {
    const result = resolveColor("#ffffff", "blueprint");
    assert.equal(result, "#ffffff");
  });

  await t.test("resolveColor: falls back to theme ink", () => {
    const result = resolveColor(undefined, "blueprint");
    assert(result, "Should return ink color from theme");
  });
});

test("render/primitives.ts", async (t) => {
  await t.test("formatNumber: rounds to 4 decimals and strips trailing zeros", () => {
    const result1 = formatNumber(3.14159);
    assert(!result1.includes("5159"), "Should round");

    const result2 = formatNumber(1.0);
    assert.equal(result2, "1", "Should strip .0");

    const result3 = formatNumber(2.5000);
    assert.equal(result3, "2.5", "Should strip trailing zeros");
  });

  await t.test("escapeXml: escapes special characters", () => {
    const result = escapeXml("<tag>&attr=\"value\"</tag>");
    assert(result.includes("&lt;"));
    assert(result.includes("&gt;"));
    assert(result.includes("&amp;"));
    assert(result.includes("&quot;"));
  });

  await t.test("escapeXml: leaves safe text unchanged", () => {
    const result = escapeXml("Hello World 123");
    assert.equal(result, "Hello World 123");
  });

  await t.test("estimateTextWidth: monospace estimate", () => {
    const width1 = estimateTextWidth("x", 10);
    const width2 = estimateTextWidth("xx", 10);

    assert(width2 > width1, "Longer text should be wider");
  });

  await t.test("polygonToSvg: generates M/L/Z path", () => {
    const polygon = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const result = polygonToSvg(polygon);

    assert(result.startsWith("M"), "Should start with M");
    assert(result.includes("L"), "Should contain L");
    assert(result.endsWith("Z"), "Should end with Z");
  });

  await t.test("polylineToSvg: generates M/L path without Z", () => {
    const path = [[0, 0], [100, 100], [200, 0]];
    const result = polylineToSvg(path);

    assert(result.startsWith("M"), "Should start with M");
    assert(result.includes("L"), "Should contain L");
    assert(!result.endsWith("Z"), "Should not end with Z");
  });
});

test("render/defs.ts", async (t) => {
  await t.test("generateDefs: returns SVG with <defs> element", () => {
    const defs = generateDefs("1:100", "m", "blueprint");

    assert(defs.includes("<defs>"));
    assert(defs.includes("</defs>"));
  });

  await t.test("generateDefs: includes material pattern definitions", () => {
    const defs = generateDefs("1:100", "m", "blueprint");

    // Should include some material patterns
    assert(defs.includes("pattern"));
  });

  await t.test("generateDefs: uses patternUnits userSpaceOnUse", () => {
    const defs = generateDefs("1:100", "m", "blueprint");

    assert(defs.includes('patternUnits="userSpaceOnUse"'));
  });
});
