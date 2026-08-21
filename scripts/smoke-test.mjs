#!/usr/bin/env node
// Renders every example in examples/ through the real MCP tool handlers and
// confirms each produces well-formed SVG. Unlike a script that just checks
// "did the overall test suite pass" and prints PASS for every *.json file
// regardless of whether it was ever actually rendered, this calls the real
// handler for each file individually, so a broken or stale example fails
// visibly instead of being reported as passing.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const examplesDir = path.join(projectRoot, "examples");
const outputDir = path.join(projectRoot, "smoke-output");

const { initializeClipper } = await import("../src/geometry/clipper.ts");
const { handleRenderFloorPlan } = await import("../src/tools/renderFloorPlan.ts");
const { handleRenderSitePlan } = await import("../src/tools/renderSitePlan.ts");

await initializeClipper();
fs.mkdirSync(outputDir, { recursive: true });

let pass = 0;
let fail = 0;

for (const file of fs.readdirSync(examplesDir).filter((f) => f.endsWith(".json"))) {
  const name = path.basename(file, ".json");
  const spec = JSON.parse(fs.readFileSync(path.join(examplesDir, file), "utf-8"));

  // Dispatch on shape: a FloorPlanSpec has `floors`; a SiteSpec doesn't.
  const isFloorPlan = Array.isArray(spec.floors);
  const handler = isFloorPlan ? handleRenderFloorPlan : handleRenderSitePlan;

  try {
    const result = await handler({ spec });
    if (result.isError) {
      console.log(`FAIL: ${name} — ${result.content[0]?.text}`);
      fail++;
      continue;
    }
    const svgs = result.content.map((c) => c.text);
    const allWellFormed = svgs.every((s) => s.includes("<svg") && s.includes("</svg>"));
    if (!allWellFormed) {
      console.log(`FAIL: ${name} — malformed SVG output`);
      fail++;
      continue;
    }
    svgs.forEach((svg, i) => {
      const suffix = svgs.length > 1 ? `_L${i}` : "";
      fs.writeFileSync(path.join(outputDir, `${name}${suffix}.svg`), svg, "utf-8");
    });
    console.log(`PASS: ${name} (${isFloorPlan ? "floor plan" : "site plan"}, ${svgs.length} SVG${svgs.length > 1 ? "s" : ""})`);
    pass++;
  } catch (e) {
    console.log(`FAIL: ${name} — ${e.message}`);
    fail++;
  }
}

console.log(`\n${pass} passed, ${fail} failed. SVGs written to ${outputDir}`);
process.exit(fail > 0 ? 1 : 0);
