#!/usr/bin/env node
// Scripted smoke check: calls the tool handlers directly (bypassing the MCP
// transport) against the three worked examples, and saves the returned SVGs
// for manual visual review. Not a substitute for the automated test suite —
// see docs/REASONS-CANVAS.md Operations step 12.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, "..");
const outputDir = path.join(projectRoot, "smoke-output");

const { handleRenderCityMap } = await import("../src/tools/renderCityMap.ts");
const { handleRenderFloorPlan } = await import("../src/tools/renderFloorPlan.ts");

fs.mkdirSync(outputDir, { recursive: true });

function loadExample(name) {
  return JSON.parse(fs.readFileSync(path.join(projectRoot, "examples", name), "utf-8"));
}

function extractSvgTexts(result) {
  return result.content.filter((c) => c.type === "text").map((c) => c.text);
}

let pass = 0;
let fail = 0;

async function check(name, fn) {
  try {
    const ok = await fn();
    if (ok) {
      console.log(`PASS: ${name}`);
      pass++;
    } else {
      console.log(`FAIL: ${name}`);
      fail++;
    }
  } catch (e) {
    console.log(`FAIL: ${name} (${e.message})`);
    fail++;
  }
}

await check("render_city_map: small-city.json", async () => {
  const result = await handleRenderCityMap({ spec: loadExample("small-city.json") });
  if (result.isError) {
    console.error(extractSvgTexts(result).join("\n"));
    return false;
  }
  const [svg] = extractSvgTexts(result);
  if (!svg?.includes("<svg")) return false;
  fs.writeFileSync(path.join(outputDir, "small-city.svg"), svg, "utf-8");
  return true;
});

await check("render_floor_plan: small-house.json", async () => {
  const result = await handleRenderFloorPlan({ spec: loadExample("small-house.json") });
  if (result.isError) {
    console.error(extractSvgTexts(result).join("\n"));
    return false;
  }
  const svgs = extractSvgTexts(result);
  if (svgs.length !== 1 || !svgs[0].includes("<svg")) return false;
  fs.writeFileSync(path.join(outputDir, "small-house_L0.svg"), svgs[0], "utf-8");
  return true;
});

await check("render_floor_plan: two-floor-building.json", async () => {
  const result = await handleRenderFloorPlan({ spec: loadExample("two-floor-building.json") });
  if (result.isError) {
    console.error(extractSvgTexts(result).join("\n"));
    return false;
  }
  // Multi-floor responses come back as a single content item whose text is a
  // JSON-stringified array of per-floor SVG strings (see renderFloorPlan.ts).
  const [payload] = extractSvgTexts(result);
  const svgs = JSON.parse(payload);
  if (!Array.isArray(svgs) || svgs.length !== 2 || svgs.some((s) => !s.includes("<svg"))) return false;
  svgs.forEach((svg, i) => {
    fs.writeFileSync(path.join(outputDir, `two-floor-building_L${i}.svg`), svg, "utf-8");
  });
  return true;
});

console.log(`\n${pass} passed, ${fail} failed. SVGs written to ${outputDir}`);
process.exit(fail > 0 ? 1 : 0);
