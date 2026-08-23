#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  StdioServerTransport,
} from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { initializeClipper } from "./geometry/clipper.js";
import { handleRenderSitePlan } from "./tools/renderSitePlan.js";
import { handleRenderFloorPlan } from "./tools/renderFloorPlan.js";
import { FloorPlanSpecSchema } from "./schema/floorplan.js";
import { SiteSpecSchema } from "./schema/site.js";
import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Build a tool inputSchema whose `spec` property is the FULL JSON Schema for
 * the given Zod spec — so a calling LLM sees every field, type, enum and bound,
 * generated from the same schema the server validates against (cannot drift).
 * `$schema` is stripped from the nested spec schema (the tool inputSchema is
 * itself the schema; a nested dialect marker is noise).
 */
function buildInputSchema(specSchema: z.ZodTypeAny, specDescription: string) {
  const jsonSchema = z.toJSONSchema(specSchema) as Record<string, unknown>;
  delete jsonSchema["$schema"];
  return {
    type: "object" as const,
    properties: {
      spec: { ...jsonSchema, description: specDescription },
      outputPath: {
        type: "string",
        description:
          "Optional file path to write the SVG (relative to the server's allowed output/ directory). If omitted, the SVG is returned as tool content only.",
      },
    },
    required: ["spec"],
    additionalProperties: false,
  };
}

/**
 * Caller-facing usage brief, surfaced via the MCP `initialize` response.
 * Distilled from the design canvas (which is NOT shipped): conventions, the
 * caller-owns-coherence contract, and the capability boundary.
 */
const INSTRUCTIONS = `parti-mcp renders 2D architectural drawings as SVG from structured JSON specs. Two tools:
- render_floor_plan(spec: FloorPlanSpec): an interior floor plan (floors, rooms, walls, door/window openings, dimensions, structural grid). Returns one SVG per floor.
- render_site_plan(spec: SiteSpec): an exterior site plan (buildings, parcels, roads, hardscape, water, landscape, barriers, trees). Returns one SVG.

Conventions (author the spec to these):
- Coordinates are 2D [x, y] in the spec's declared real unit (mm|cm|m|ft|in). Axes are SVG-native: origin top-left, +x right, +y DOWN. No y-flip.
- scale is a named paper scale "1:N". Annotation sizes (text, ticks, line weights) are authored in paper-mm and converted by the server; you supply real-unit geometry.
- Rooms are polygons authored to the interior wall face (honest floor area). Walls are centerlines + thickness; the server offsets/unions them into cut poché. A wall's heightClass is "full" (default, solid poché) or "low" (half/pony/knee wall or railing, below the cut plane → drawn as a dashed outline, no fill). Openings reference a wall by wallId and sit at positionAlongWall in [0,1]; doors need hinge (start|end) + swingSide (left|right).
- Stairs (straight run): give footprint, run [bottom, top] travel centerline, treads count, and direction (up|down). Rendered as tread lines + an UP/DN direction arrow + a diagonal break line (treads beyond the cut are dashed). Ladders: give path [start, end] + width; rendered as two rails + rungs. Elevators: give footprint (shaft rectangle) + optional label; rendered as an X-in-box shaft with an inset car (common in offices/mixed-use).
- Columns/piers/isolated masonry: give position, shape (square|rectangular|round), size (square/round) or width+depth (rectangular), optional material; rendered as a poché/hatch footprint (place on structural-grid intersections). Curved walls: give a wall a two-point path plus curve {radius, clockwise}; the server arcs it and it unions/cuts like a straight wall.
- Site paved areas (surface: concrete|asphalt|pavers|gravel|patio|deck|driveway|sidewalk) normally render below water; set elevated:true on a paved area to render it ABOVE water (a deck/boardwalk/jetty over a pond or pool). A deck surface hatches as wood planks.
- Labels: area entities (rooms, buildings, paved areas, water, green spaces) auto-label from their type/surface. Send label to override the name verbatim (a room still appends its computed area); send labelOrientation "vertical" to rotate the label 90° reading bottom-to-top so it fits a narrow shape (default "horizontal"); send labelPosition to place the label within the area — center (default) or a bounding-box position top-left|top|top-right|left|right|bottom-left|bottom|bottom-right (corner positions anchor the text to the corner, reading inward).
- Per-element style.fill (a safe color token) highlights an element. material picks a hatch (concrete, brick, masonry, insulation, earth, wood — wood is parallel plank lines).

The server renders exactly what the spec describes — it does NOT infer, correct, or complete the design. You (the caller) own coherence: rooms must tile the floor without unintended overlaps/gaps, wall centerlines must meet at corners to enclose, doors must sit on the wall separating the spaces they join, and every room a person should reach must be reachable from an entrance through connected doors. There is NO wayfinding/reachability check; an incoherent plan renders as given. Intentional exceptions (walk-through closet, open plan) are fine.

Capability boundary: plans are a 2D cut with a walls+rooms+openings+stairs+ladders+elevators+columns vocabulary (walls may be straight or circular-arc; heightClass full|low) and NO continuous vertical model. Not supported: furniture/fixtures, MEP, and non-circular (spline/elliptical) curves. Mixed wall materials on one floor ARE supported (rendered per material group).

Call each tool with { spec: <object matching the tool's inputSchema> }. Determinism: an identical spec yields byte-identical SVG.`;

const server = new Server(
  {
    name: "parti-mcp",
    version: "1.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
    instructions: INSTRUCTIONS,
  }
);

// Exported so tests (and callers) can assert the advertised discovery surface
// without spawning a transport.
export { INSTRUCTIONS };

// Define the tools that this server provides
export const tools = [
  {
    name: "ping",
    description: "Responds with pong",
    inputSchema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "render_site_plan",
    description:
      "Renders an exterior site plan (buildings, parcels, roads, hardscape, water, landscape, barriers, trees) from a SiteSpec. Returns one SVG. See the server instructions for conventions and the coherence contract.",
    inputSchema: buildInputSchema(
      SiteSpecSchema,
      "SiteSpec object (or JSON string) defining the site plan. See this schema's properties for every field."
    ),
  },
  {
    name: "render_floor_plan",
    description:
      "Renders an interior floor plan (floors, rooms, walls, door/window openings, dimensions, structural grid) from a FloorPlanSpec. Returns one SVG per floor. See the server instructions for conventions and the coherence contract.",
    inputSchema: buildInputSchema(
      FloorPlanSpecSchema,
      "FloorPlanSpec object (or JSON string) defining the floor plan. See this schema's properties for every field."
    ),
  },
];

// Handle listing tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools,
  };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "ping") {
    return {
      content: [
        {
          type: "text" as const,
          text: "pong",
        },
      ],
    };
  }

  if (request.params.name === "render_site_plan") {
    return (await handleRenderSitePlan(request.params.arguments || {})) as CallToolResult;
  }

  if (request.params.name === "render_floor_plan") {
    return (await handleRenderFloorPlan(request.params.arguments || {})) as CallToolResult;
  }

  return {
    content: [
      {
        type: "text" as const,
        text: `Unknown tool: ${request.params.name}`,
      },
    ],
    isError: true,
  };
});

async function main() {
  // Initialize Clipper WASM instance on startup
  await initializeClipper();

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

// Only start the stdio server when run as the entry point, so importing this
// module (e.g. from a test asserting `tools`/`INSTRUCTIONS`) has no side effect.
// Compare *realpaths* rather than raw strings: when launched through a package
// `bin` symlink (e.g. `npx parti-mcp` → node_modules/.bin/parti-mcp), argv[1]
// is the symlink while import.meta.url is the resolved file, so a naive
// `import.meta.url === file://${argv[1]}` check would be false and the server
// would silently never start.
function isEntryPoint(): boolean {
  const argv1 = process.argv[1];
  if (!argv1) return false;
  try {
    const thisFile = realpathSync(fileURLToPath(import.meta.url));
    const invoked = realpathSync(argv1);
    return thisFile === invoked;
  } catch {
    return false;
  }
}

if (isEntryPoint()) {
  main().catch(console.error);
}
