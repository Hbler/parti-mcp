import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  xmlEscape,
  renderPolygonEntity,
  renderLinearEntity,
  renderLabel,
  composeSVG,
  type PolygonEntity,
  type LinearEntity,
} from "../src/render/svg.js";
import type { Label } from "../src/schema.js";

// Test 8: renderPolygonEntity generates valid SVG polygon
test("renderPolygonEntity generates valid SVG polygon", () => {
  const entity: PolygonEntity = {
    polygon: [[[0, 0], [10, 0], [10, 10], [0, 10]]],
    style: { fill: "#ff0000" },
  };
  const result = renderPolygonEntity(entity);

  assert(result.includes("<polygon"), "should contain <polygon");
  assert(result.includes("points="), "should contain points attribute");
  assert(result.includes("#ff0000"), "should contain fill color");
  assert(result.includes("/>") || result.includes("</polygon>"), "should be valid XML");
});

// Test 9: renderLinearEntity buffers and renders
test("renderLinearEntity buffers and renders", () => {
  const entity: LinearEntity = {
    path: [[0, 0], [10, 0]],
    width: 1,
    style: { fill: "#00ff00" },
  };
  const result = renderLinearEntity(entity);

  assert(result.includes("<polygon"), "should contain <polygon");
  assert(typeof result, "string");
  assert(result.length > 0, "should produce non-empty output");
});

// Test 10: xmlEscape escapes special chars
test("xmlEscape escapes special characters", () => {
  const input = '&<>"\'';
  const output = xmlEscape(input);

  assert.equal(output, "&amp;&lt;&gt;&quot;&#39;");
});

// Test 11: renderLabel with text and position
test("renderLabel with text and position", () => {
  const label: Label = {
    text: "Room A",
    position: [5, 5],
    size: 12,
  };
  const result = renderLabel(label);

  assert(result.includes("<text"), "should contain <text");
  assert(result.includes("Room A"), "should contain label text");
  assert(result.includes("font-size"), "should contain font-size");
  assert(result.includes("</text>"), "should be valid XML");
});

// Test 12: renderLabel escapes text
test("renderLabel escapes text", () => {
  const label: Label = {
    text: "A & B < C",
    position: [1, 2],
    size: 10,
  };
  const result = renderLabel(label);

  assert(result.includes("A &amp; B &lt; C"), "should escape special chars");
  assert(!result.includes("A & B <"), "should not contain unescaped chars");
});

// Test 13: composeSVG creates full SVG document
test("composeSVG creates full SVG document", () => {
  const elements = ["<polygon points=\"0,0 10,0 10,10\" />"];
  const labels = ["<text x=\"5\" y=\"5\" >Room A</text>"];
  const viewBox = "0 0 100 100";

  const result = composeSVG("#ffffff", elements, labels, viewBox);

  assert(result.includes("<svg"), "should start with <svg");
  assert(result.includes('viewBox="0 0 100 100"'), "should contain viewBox");
  assert(result.includes("<polygon"), "should contain elements");
  assert(result.includes("<text"), "should contain labels");
  assert(result.includes("</svg>"), "should end with </svg>");
  assert(result.includes("<rect") && result.includes("fill:#ffffff"), "should have background rect if provided");
});
