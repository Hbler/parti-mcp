import { test } from "node:test";
import { strict as assert } from "node:assert";
import { tools, INSTRUCTIONS } from "../src/index.js";

test("server discovery surface", async (t) => {
  await t.test("advertises render_floor_plan and render_site_plan tools", () => {
    const names = tools.map((tool) => tool.name);
    assert(names.includes("render_floor_plan"));
    assert(names.includes("render_site_plan"));
  });

  await t.test("floor-plan inputSchema is the real spec schema, not a stub", () => {
    const floor = tools.find((tool) => tool.name === "render_floor_plan")!;
    const schema = floor.inputSchema as {
      type: string;
      properties: Record<string, { type?: string; properties?: Record<string, unknown> }>;
      required: string[];
    };
    assert.equal(schema.type, "object");
    assert(schema.required.includes("spec"), "spec is required");

    const spec = schema.properties.spec;
    // The nested spec schema must carry the real FloorPlanSpec shape, not
    // `type: object` with nothing under it.
    assert.equal(spec.type, "object");
    assert(spec.properties, "spec schema must expose its properties");
    for (const key of ["unit", "scale", "floors"]) {
      assert(key in spec.properties!, `spec schema should describe "${key}"`);
    }
    // No leftover $schema dialect marker on the nested schema.
    assert(!("$schema" in spec), "$schema should be stripped from the nested spec schema");
  });

  await t.test("site inputSchema exposes the site entity fields", () => {
    const site = tools.find((tool) => tool.name === "render_site_plan")!;
    const spec = (site.inputSchema as { properties: { spec: { properties?: Record<string, unknown> } } })
      .properties.spec;
    assert(spec.properties, "site spec schema must expose its properties");
    for (const key of ["buildings", "roads", "parcels"]) {
      assert(key in spec.properties!, `site spec schema should describe "${key}"`);
    }
  });

  await t.test("instructions carry the conventions and coherence contract", () => {
    assert(typeof INSTRUCTIONS === "string" && INSTRUCTIONS.length > 200);
    // Coordinate convention, coherence contract, and capability boundary must
    // all reach the caller through the instructions.
    assert(/\+y DOWN/i.test(INSTRUCTIONS), "should state the y-down axis convention");
    assert(/own coherence/i.test(INSTRUCTIONS), "should state caller-owns-coherence");
    assert(/no wayfinding/i.test(INSTRUCTIONS), "should state there is no reachability check");
    assert(/stairs/i.test(INSTRUCTIONS), "should mention stairs (now a supported symbol)");
    assert(/curved\/arched walls|furniture/i.test(INSTRUCTIONS), "should state a real capability boundary");
  });
});
