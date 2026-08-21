import { z } from "zod";
import * as fs from "node:fs";
import * as path from "node:path";
import { MapSpecSchema, type MapSpec } from "../schema.js";
import { computeBbox, computeViewBox, getCentroid, type PolygonEntity, type LinearEntity } from "../geometry.js";
import { renderPolygonEntity, renderLinearEntity, renderLabel, composeSVG } from "../render/svg.js";
import { bufferPath } from "../geometry.js";
import { validateOutputPath } from "../outputPath.js";

export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/**
 * Handle render_city_map tool request
 */
export async function handleRenderCityMap(args: Record<string, unknown>): Promise<ToolResult> {
  try {
    // Step 1: Parse and validate spec
    const specInput = args.spec;
    if (!specInput) {
      return createError("spec is required");
    }

    let spec: MapSpec;
    if (typeof specInput === "string") {
      try {
        spec = JSON.parse(specInput);
      } catch (e) {
        return createError(`Failed to parse spec as JSON: ${(e as Error).message}`);
      }
    } else {
      spec = specInput as MapSpec;
    }

    // Validate against schema
    const parseResult = MapSpecSchema.safeParse(spec);
    if (!parseResult.success) {
      return createError(`Invalid MapSpec: ${parseResult.error.message}`);
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

    // Step 3: Collect and convert entities
    const polygonEntities: Array<PolygonEntity & { type: string; zone?: string; floorCount?: number }> = [];
    const linearEntities: Array<LinearEntity & { type: string }> = [];
    const labeledEntities: Array<{ entity: PolygonEntity; label: any; centroid?: any }> = [];

    // Render in order: greenspaces, blocks, roads, buildings (painter's algorithm)

    // Greenspaces
    if (spec.greenspaces && spec.greenspaces.length > 0) {
      for (const gs of spec.greenspaces) {
        polygonEntities.push({
          type: "greenspace",
          polygon: gs.polygon as number[][][],
          style: gs.style || { fill: "#90EE90" },
        });
      }
    }

    // Blocks (with zone coloring)
    if (spec.blocks && spec.blocks.length > 0) {
      for (const block of spec.blocks) {
        const zoneColor = getZoneColor(block.zone);
        polygonEntities.push({
          type: "block",
          zone: block.zone,
          polygon: block.polygon as number[][][],
          style: block.style || { fill: zoneColor },
        });
      }
    }

    // Roads (buffer to polygons) — drawn before buildings so buildings sit on top
    if (spec.roads && spec.roads.length > 0) {
      for (const road of spec.roads) {
        const bufferedPolygon = bufferPath(road.path as number[][], road.width);
        polygonEntities.push({
          type: "road",
          polygon: bufferedPolygon,
          style: road.style || { fill: "#A9A9A9" },
        });
      }
    }

    // Buildings (with height/floor-based opacity)
    if (spec.buildings && spec.buildings.length > 0) {
      for (const building of spec.buildings) {
        const opacity = getOpacityFromFloorCount(building.floorCount);
        polygonEntities.push({
          type: "building",
          floorCount: building.floorCount,
          polygon: building.footprint as number[][][],
          style: building.style || {
            fill: "#D3D3D3",
            opacity,
          },
        });

        // Track buildings with labels
        if (building.label) {
          labeledEntities.push({
            entity: { polygon: building.footprint as number[][][] },
            label: building.label,
            centroid: getCentroid(building.footprint as number[][][]),
          });
        }
      }
    }

    // Step 4: Compute geometry
    const allEntities: (PolygonEntity | LinearEntity)[] = polygonEntities;
    const bbox = computeBbox(allEntities);
    const viewBoxResult = computeViewBox(bbox);

    // Step 5: Render entities
    const elements: string[] = [];
    for (const entity of polygonEntities) {
      const element = renderPolygonEntity(entity, entity.style);
      if (element) {
        elements.push(element);
      }
    }

    // Step 6: Render labels
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

    // Step 7: Compose SVG
    const svgContent = composeSVG(spec.background, elements, labels, viewBoxResult.viewBox);

    // Step 8: Write file if outputPath provided
    if (outputPath) {
      try {
        fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        fs.writeFileSync(outputPath, svgContent, "utf-8");
        return {
          content: [
            {
              type: "text",
              text: `SVG written to ${outputPath}`,
            },
          ],
        };
      } catch (e) {
        return createError(`Failed to write file: ${(e as Error).message}`);
      }
    }

    // Step 9: Return SVG content
    return {
      content: [
        {
          type: "text",
          text: svgContent,
        },
      ],
    };
  } catch (e) {
    return createError(`Unexpected error: ${(e as Error).message}`);
  }
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
 * Get zone-specific color for blocks
 */
function getZoneColor(zone?: string): string {
  switch (zone?.toLowerCase()) {
    case "residential":
      return "#E8E8E8"; // light gray
    case "commercial":
      return "#FFE8C6"; // light orange
    case "park":
      return "#7FBF7F"; // darker green
    default:
      return "#E8E8E8"; // default to light gray
  }
}

/**
 * Calculate opacity based on floor count
 * Range: 0.5 to 1.0
 */
function getOpacityFromFloorCount(floorCount?: number): number {
  if (!floorCount) {
    return 0.7;
  }

  // Map floor count to opacity: 1-5 floors -> 0.5-1.0
  const maxFloors = 10;
  const minOpacity = 0.5;
  const maxOpacity = 1.0;

  const normalizedFloors = Math.min(floorCount, maxFloors);
  const opacity = minOpacity + (normalizedFloors / maxFloors) * (maxOpacity - minOpacity);

  return Math.round(opacity * 100) / 100; // Round to 2 decimals
}
