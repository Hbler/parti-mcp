import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { FloorPlanSpecSchema, type FloorPlanSpec, type Floor } from "../schema.js";
import { computeBbox, computeViewBox, getCentroid, bufferPath, type PolygonEntity } from "../geometry.js";
import { renderPolygonEntity, renderLabel, composeSVG, xmlEscape } from "../render/svg.js";
import { cutWallOpenings, type Coordinates } from "../render/openings.js";
import { validateOutputPath } from "../outputPath.js";

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Handle render_floor_plan tool request
 */
export async function handleRenderFloorPlan(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    // Step 1: Parse and validate spec
    const specInput = args.spec;
    if (!specInput) {
      return createError("spec is required");
    }

    let spec: FloorPlanSpec;
    if (typeof specInput === "string") {
      try {
        spec = JSON.parse(specInput);
      } catch (e) {
        return createError(`Failed to parse spec as JSON: ${(e as Error).message}`);
      }
    } else {
      spec = specInput as FloorPlanSpec;
    }

    // Validate against schema
    const parseResult = FloorPlanSpecSchema.safeParse(spec);
    if (!parseResult.success) {
      return createError(`Invalid FloorPlanSpec: ${parseResult.error.message}`);
    }
    spec = parseResult.data;

    // Step 2: Handle outputPath security
    let outputPath: string | null = null;
    if (args.outputPath) {
      outputPath = validateOutputPath(args.outputPath as string);
      if (!outputPath) {
        return createError("outputPath rejected for security reasons (path traversal or outside allowed directory)");
      }
    }

    // Step 3: Render each floor to SVG
    const floorSVGs: Array<{ floor: Floor; svg: string }> = [];

    for (const floor of spec.floors) {
      const svg = renderFloor(floor, spec.buildingLabel);
      floorSVGs.push({ floor, svg });
    }

    // Step 4: Write files if outputPath provided
    if (outputPath) {
      try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });

        // Strip any trailing .svg so we don't produce e.g. "plan.svg_L0.svg".
        const base = outputPath.replace(/\.svg$/i, "");
        // Write each floor to separate file
        for (const { floor, svg } of floorSVGs) {
          const fileName = `${base}_L${floor.level}.svg`;
          fs.writeFileSync(fileName, svg, "utf-8");
        }

        return {
          content: [
            {
              type: "text",
              text: `SVG files written for ${floorSVGs.length} floor(s)`,
            },
          ],
        };
      } catch (e) {
        return createError(`Failed to write file: ${(e as Error).message}`);
      }
    }

    // Step 5: Return SVG content
    if (floorSVGs.length === 1) {
      // Single floor: return SVG directly
      return {
        content: [
          {
            type: "text",
            text: floorSVGs[0].svg,
          },
        ],
      };
    } else {
      // Multiple floors: return array of SVGs
      const svgArray = floorSVGs.map((f) => f.svg);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(svgArray),
          },
        ],
      };
    }
  } catch (e) {
    return createError(`Unexpected error: ${(e as Error).message}`);
  }
}

/**
 * Render a single floor to SVG
 */
function renderFloor(floor: Floor, buildingLabel?: string): string {
  // Collect entities in painter's order: outline, rooms, walls
  const polygonEntities: Array<PolygonEntity & { type: string; roomType?: string }> = [];
  const openingMarkers: string[] = [];
  const labeledEntities: Array<{ entity: PolygonEntity; label: any; centroid?: any }> = [];

  // Step 1: Floor outline (light gray background)
  polygonEntities.push({
    type: "floor-outline",
    polygon: floor.outline,
    style: {
      fill: "#D0D0D0",
      stroke: "#808080",
      strokeWidth: 2,
    },
  });

  // Step 2: Rooms (filled by roomType)
  if (floor.rooms && floor.rooms.length > 0) {
    for (const room of floor.rooms) {
      const roomColor = getRoomTypeColor(room.roomType);
      polygonEntities.push({
        type: "room",
        roomType: room.roomType,
        polygon: room.polygon,
        style: room.style || {
          fill: roomColor,
          stroke: "#999999",
          strokeWidth: 1,
        },
      });

      // Track room labels
      if (room.label) {
        labeledEntities.push({
          entity: { polygon: room.polygon },
          label: room.label,
          centroid: getCentroid(room.polygon),
        });
      }
    }
  }

  // Step 3: Walls (dark gray, buffered) with openings cut through them
  if (floor.walls && floor.walls.length > 0) {
    for (const wall of floor.walls) {
      const bufferedPolygon = bufferPath(wall.path, wall.thickness) as Coordinates[][];
      const wallStyle = wall.style || {
        fill: "#808080",
        stroke: "#404040",
        strokeWidth: 1,
      };

      const wallOpenings = (floor.openings || []).filter(
        (o) => o.wallId === wall.id
      );

      if (wallOpenings.length === 0) {
        polygonEntities.push({
          type: "wall",
          polygon: bufferedPolygon,
          style: wallStyle,
        });
      } else {
        // Cut real gaps; a through-opening can split the wall into multiple
        // polygons, so render each resulting piece.
        const result = cutWallOpenings(
          bufferedPolygon,
          wall.path as Coordinates[],
          wallOpenings
        );
        for (const poly of result.wallPolygons) {
          polygonEntities.push({
            type: "wall",
            polygon: poly,
            style: wallStyle,
          });
        }
        openingMarkers.push(...result.markers);
      }
    }
  }

  // Step 5: Compute geometry
  const allEntities: PolygonEntity[] = polygonEntities;
  const bbox = computeBbox(allEntities);
  const viewBoxResult = computeViewBox(bbox);

  // Step 6: Render all polygon entities
  const elements: string[] = [];
  for (const entity of polygonEntities) {
    const element = renderPolygonEntity(entity, entity.style);
    if (element) {
      elements.push(element);
    }
  }

  // Step 7: Add opening markers
  elements.push(...openingMarkers);

  // Step 8: Render labels
  const labels: string[] = [];
  for (const labeledEntity of labeledEntities) {
    let position: [number, number] = [0, 0];

    if (labeledEntity.label.position) {
      if (Array.isArray(labeledEntity.label.position)) {
        position = [labeledEntity.label.position[0], labeledEntity.label.position[1]];
      }
    } else if (labeledEntity.centroid) {
      position = [labeledEntity.centroid.x, labeledEntity.centroid.y];
    }

    const label = renderLabel(labeledEntity.label, position);
    if (label) {
      labels.push(label);
    }
  }

  // Step 9: Compose SVG with optional building label comment
  let svgContent = "";
  if (buildingLabel) {
    svgContent += `<!-- Building: ${xmlEscape(buildingLabel)} -->`;
  }
  svgContent += composeSVG(undefined, elements, labels, viewBoxResult.viewBox);

  return svgContent;
}

/**
 * Create error result
 */
function createError(message: string): ToolResult {
  return {
    content: [
      {
        type: "text",
        text: message,
      },
    ],
    isError: true,
  };
}

/**
 * Get color for room type
 */
function getRoomTypeColor(roomType: string): string {
  switch (roomType?.toLowerCase()) {
    case "bedroom":
      return "#E8E8FF"; // light blue
    case "kitchen":
      return "#FFFFE8"; // light yellow
    case "bathroom":
      return "#E8F8FF"; // light cyan
    case "living":
      return "#F0E8F0"; // light purple/pink
    case "hallway":
      return "#F0F0F0"; // very light gray
    default:
      return "#EFEFEF"; // light gray
  }
}
