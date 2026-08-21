import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  mmPerUnit,
  parseScale,
  modelPerPaperMm,
  formatDimensionValue,
  getScaleBarStops,
} from "../src/geometry/scale.js";

test("scale.ts", async (t) => {
  await t.test("mmPerUnit: standard conversions", () => {
    assert.equal(mmPerUnit("mm"), 1);
    assert.equal(mmPerUnit("cm"), 10);
    assert.equal(mmPerUnit("m"), 1000);
    assert.equal(mmPerUnit("ft"), 304.8); // 1 foot ≈ 304.8 mm
    assert.equal(mmPerUnit("in"), 25.4);  // 1 inch = 25.4 mm
  });

  await t.test("parseScale: converts '1:N' format", () => {
    const scale1_100 = parseScale("1:100");
    assert.equal(scale1_100, 100);

    const scale1_50 = parseScale("1:50");
    assert.equal(scale1_50, 50);

    const scale1_1000 = parseScale("1:1000");
    assert.equal(scale1_1000, 1000);
  });

  await t.test("parseScale: rejects invalid formats", () => {
    assert.throws(
      () => parseScale("100:1"),
      { message: /must be in '1:N'/ }
    );
    assert.throws(
      () => parseScale("1:0"),
      { message: /denominator must be positive/ }
    );
    assert.throws(
      () => parseScale("invalid"),
      { message: /must be in '1:N'/ }
    );
  });

  await t.test("modelPerPaperMm: exact conversion example", () => {
    // 0.5 mm @ 1:100 with unit m:
    // modelPerPaperMm = 100 / 1000 = 0.1 model units per paper mm
    const result = modelPerPaperMm("1:100", "m");
    assert.equal(result, 0.1);
  });

  await t.test("modelPerPaperMm: 1:50 scale with feet", () => {
    // 1:50 with feet:
    // modelPerPaperMm = 50 / 304.8 ≈ 0.164
    const result = modelPerPaperMm("1:50", "ft");
    assert(Math.abs(result - 50 / 304.8) < 0.0001);
  });

  await t.test("formatDimensionValue: formats real units with unit suffix", () => {
    // 3.5 meters should format as "3.5 m"
    const result = formatDimensionValue(3.5, "m");
    assert(result.includes("3.5"));
    assert(result.includes("m"));
  });

  await t.test("formatDimensionValue: removes trailing zeros", () => {
    // 1.0 should format as "1" not "1.0"
    const result = formatDimensionValue(1.0, "m");
    assert(!result.includes(".0"));
  });

  await t.test("formatDimensionValue: feet and inches", () => {
    // 5 feet should format appropriately
    const result = formatDimensionValue(5, "ft");
    assert(result.includes("5"));
    assert(result.includes("ft"));
  });

  await t.test("getScaleBarStops: generates labeled tick stops", () => {
    // For a 1:100 scale over 10 meters, expected stops like 1m, 2m, etc.
    const stops = getScaleBarStops("1:100", "m", 10);

    assert(Array.isArray(stops));
    assert(stops.length > 0);

    // Each stop should have position and label
    for (const stop of stops) {
      assert.equal(typeof stop.positionMm, "number");
      assert.equal(typeof stop.label, "string");
      assert(stop.positionMm >= 0);
    }
  });

  await t.test("getScaleBarStops: 1:1000 scale", () => {
    // For a 1:1000 scale, expect meter labels
    const stops = getScaleBarStops("1:1000", "m", 100);

    assert(Array.isArray(stops));
    assert(stops.length > 0);

    // Labels should include unit
    assert(stops.some(s => s.label.includes("m") || s.label.includes("km")));
  });
});
