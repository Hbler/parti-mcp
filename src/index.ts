import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  StdioServerTransport,
} from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { initializeClipper } from "./geometry/clipper.js";
import { handleRenderSitePlan } from "./tools/renderSitePlan.js";
import { handleRenderFloorPlan } from "./tools/renderFloorPlan.js";

const server = new Server(
  {
    name: "plan-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Define the tools that this server provides
const tools = [
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
    description: "Renders a site plan from a SiteSpec",
    inputSchema: {
      type: "object",
      properties: {
        spec: {
          type: ["object", "string"],
          description: "SiteSpec object or JSON string defining the site plan structure",
        },
        outputPath: {
          type: "string",
          description: "Optional file path to write SVG (relative to output/ directory)",
        },
      },
      required: ["spec"],
    },
  },
  {
    name: "render_floor_plan",
    description: "Renders a floor plan from a FloorPlanSpec",
    inputSchema: {
      type: "object",
      properties: {
        spec: {
          type: ["object", "string"],
          description: "FloorPlanSpec object or JSON string defining the floor plan structure",
        },
        outputPath: {
          type: "string",
          description: "Optional file path to write SVG (relative to output/ directory)",
        },
      },
      required: ["spec"],
    },
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

main().catch(console.error);
