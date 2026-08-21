import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  UnitSchema,
  ScaleSchema,
  ThemeSchema,
  ColorTokenSchema,
  DocumentMetaSchema,
  StyleSchema,
} from "../src/schema/common.js";

test("schema/common.ts", async (t) => {
  await t.test("UnitSchema: accepts valid units", () => {
    const units = ["mm", "cm", "m", "ft", "in"];
    for (const unit of units) {
      const result = UnitSchema.safeParse(unit);
      assert(result.success, `Should accept ${unit}`);
    }
  });

  await t.test("UnitSchema: rejects invalid units", () => {
    const result = UnitSchema.safeParse("km");
    assert(!result.success);
  });

  await t.test("ScaleSchema: accepts valid scale strings", () => {
    const scales = ["1:50", "1:100", "1:1000"];
    for (const scale of scales) {
      const result = ScaleSchema.safeParse(scale);
      assert(result.success, `Should accept ${scale}`);
    }
  });

  await t.test("ScaleSchema: rejects invalid scale format", () => {
    const result = ScaleSchema.safeParse("100:1");
    assert(!result.success);
  });

  await t.test("ScaleSchema: rejects 1:0", () => {
    const result = ScaleSchema.safeParse("1:0");
    assert(!result.success);
  });

  await t.test("ThemeSchema: accepts valid themes", () => {
    const themes = ["blueprint", "whiteprint"];
    for (const theme of themes) {
      const result = ThemeSchema.safeParse(theme);
      assert(result.success);
    }
  });

  await t.test("ColorTokenSchema: accepts hex colors", () => {
    const colors = ["#fff", "#ffffff", "#abc123"];
    for (const color of colors) {
      const result = ColorTokenSchema.safeParse(color);
      assert(result.success, `Should accept ${color}`);
    }
  });

  await t.test("ColorTokenSchema: rejects invalid hex", () => {
    const result = ColorTokenSchema.safeParse("#gggggg");
    assert(!result.success);
  });

  await t.test("ColorTokenSchema: rejects non-hex/non-named", () => {
    const result = ColorTokenSchema.safeParse("rgb(255, 0, 0)");
    assert(!result.success);
  });

  await t.test("DocumentMetaSchema: accepts valid meta", () => {
    const meta = {
      unit: "m",
      scale: "1:100",
      theme: "blueprint",
      titleBlock: {
        title: "Test Plan",
        drawingNumber: "001",
        date: "2025-01-01",
        project: "Test",
        northAngle: 0,
      },
    };
    const result = DocumentMetaSchema.safeParse(meta);
    assert(result.success);
  });

  await t.test("DocumentMetaSchema: unit is required", () => {
    const meta = { scale: "1:100" };
    const result = DocumentMetaSchema.safeParse(meta);
    assert(!result.success);
  });

  await t.test("DocumentMetaSchema: scale is required", () => {
    const meta = { unit: "m" };
    const result = DocumentMetaSchema.safeParse(meta);
    assert(!result.success);
  });

  await t.test("StyleSchema: accepts valid fill colors", () => {
    const style = { fill: "#ffffff" };
    const result = StyleSchema.safeParse(style);
    assert(result.success);
  });

  await t.test("StyleSchema: rejects invalid fill (injection guard)", () => {
    const style = { fill: "url(#malicious)" };
    const result = StyleSchema.safeParse(style);
    assert(!result.success, "Should reject potentially malicious fill");
  });

  await t.test("StyleSchema: accepts lineweight roles", () => {
    const roles = ["heavy", "medium", "light", "fine"];
    for (const role of roles) {
      const style = { lineweight: role };
      const result = StyleSchema.safeParse(style);
      assert(result.success, `Should accept lineweight ${role}`);
    }
  });

  await t.test("StyleSchema: accepts linetype values", () => {
    const types = ["solid", "dashed", "dashdot"];
    for (const type of types) {
      const style = { linetype: type };
      const result = StyleSchema.safeParse(style);
      assert(result.success, `Should accept linetype ${type}`);
    }
  });
});
