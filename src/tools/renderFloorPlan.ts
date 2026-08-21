/**
 * tools/renderFloorPlan.ts — Render floor plan from FloorPlanSpec
 * CRITICAL: offset→union→cut→stroke pipeline for walls, per-floor SVG output
 */

import { FloorPlanSpecSchema, type FloorPlanSpec, type Floor } from "../schema/floorplan.js";
import { getClipper } from "../geometry/clipper.js";
import {
  offsetCenterline,
  unionPolygons,
  differencePolygons,
  type Polygon,
} from "../geometry/clipper.js";
import { getPointAlongPath, getDoorcSwingArc, getBbox, getCentroid, getPolygonArea, getPerpendicular } from "../geometry/primitives.js";
import { modelPerPaperMm } from "../geometry/scale.js";
import { createLayerGroup } from "../render/layers.js";
import {
  polygonToSvg,
  polylineToSvg,
  pathToSvg,
  lineToSvg,
  textLinesToSvg,
  formatNumber,
} from "../render/primitives.js";
import { getTheme, getLineweight, resolveFill, resolveStroke, getContrastingTextColor } from "../render/theme.js";
import { getMaterialPatternId } from "../render/defs.js";
import { renderDoorSwing, renderWindowGlazing, renderDimensionString, renderGridBubble } from "../render/symbols.js";
import { generateSheet } from "../render/sheet.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Handle render_floor_plan tool request
 */
export async function handleRenderFloorPlan(
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    const specInput = args.spec;
    if (!specInput) {
      return createError("spec is required");
    }

    let spec: FloorPlanSpec;
    if (typeof specInput === "string") {
      try {
        spec = JSON.parse(specInput);
      } catch (e) {
        return createError(`Invalid JSON: ${String(e)}`);
      }
    } else {
      spec = specInput as FloorPlanSpec;
    }

    const validation = FloorPlanSpecSchema.safeParse(spec);
    if (!validation.success) {
      return createError(`Spec validation failed: ${validation.error.message}`);
    }

    const validSpec = validation.data;

    // Render each floor as separate SVG
    const svgStrings: string[] = [];
    for (const floor of validSpec.floors) {
      const svg = renderFloor(floor, validSpec);
      svgStrings.push(svg);
    }

    return {
      content: svgStrings.map((svg) => ({
        type: "text",
        text: svg,
      })),
    };
  } catch (err) {
    return createError(`render_floor_plan failed: ${String(err)}`);
  }
}

/**
 * Render a single floor
 */
function renderFloor(floor: Floor, spec: FloorPlanSpec): string {
  const clipper = getClipper();
  const theme = spec.theme || "blueprint";
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(spec.scale, spec.unit);

  const layers: Record<string, string[]> = {
    "A-FLOR": [],
    "A-WALL": [],
    "A-GLAZ": [],
    "A-DOOR": [],
    "A-ANNO-DIMS": [],
    "A-ANNO-TEXT": [],
    "S-GRID": [],
  };

  // ========================================================================
  // CRITICAL JUNCTION PIPELINE: Walls
  // offset each centerline → union all → difference openings → stroke once
  // ========================================================================

  let wallPoché: Polygon[] = [];

  if (floor.walls && floor.walls.length > 0) {
    // Step 1: Offset each wall centerline to create bands
    const wallBands: Polygon[] = [];
    for (const wall of floor.walls) {
      const bands = offsetCenterline(clipper, wall.path, wall.thickness);
      wallBands.push(...bands);
    }

    // Step 2: Union all wall bands into one merged polygon
    wallPoché = unionPolygons(clipper, wallBands);

    // Step 3: Cut openings from the merged wall poché
    if (floor.openings && floor.openings.length > 0) {
      const openingCutters: Polygon[] = [];

      for (const opening of floor.openings) {
        // Find the wall this opening is in
        const wall = floor.walls.find((w) => w.id === opening.wallId);
        if (!wall) continue;

        // Compute opening bounds (rectangle oriented to the wall, not axis-aligned)
        const openingPoint = getPointAlongPath(
          wall.path,
          opening.positionAlongWall
        );

        // Get perpendicular vector to wall at this point (normal to wall)
        const perpPoint = getPerpendicular(wall.path, opening.positionAlongWall, 1);
        const perpVec = [
          perpPoint[0] - openingPoint[0],
          perpPoint[1] - openingPoint[1],
        ];
        const perpLen = Math.sqrt(perpVec[0] * perpVec[0] + perpVec[1] * perpVec[1]);
        const perpUnit = perpLen > 0 ? [perpVec[0] / perpLen, perpVec[1] / perpLen] : [0, 1];

        // Wall direction is 90° rotation of perpendicular
        const wallUnit = [perpUnit[1], -perpUnit[0]];

        // Build cutter rectangle in wall-aligned coordinates
        const halfWidth = opening.width / 2;
        const halfThickness = (wall.thickness * 1.5) / 2;

        const cutter: Polygon = [
          [
            openingPoint[0] - wallUnit[0] * halfWidth - perpUnit[0] * halfThickness,
            openingPoint[1] - wallUnit[1] * halfWidth - perpUnit[1] * halfThickness,
          ],
          [
            openingPoint[0] + wallUnit[0] * halfWidth - perpUnit[0] * halfThickness,
            openingPoint[1] + wallUnit[1] * halfWidth - perpUnit[1] * halfThickness,
          ],
          [
            openingPoint[0] + wallUnit[0] * halfWidth + perpUnit[0] * halfThickness,
            openingPoint[1] + wallUnit[1] * halfWidth + perpUnit[1] * halfThickness,
          ],
          [
            openingPoint[0] - wallUnit[0] * halfWidth + perpUnit[0] * halfThickness,
            openingPoint[1] - wallUnit[1] * halfWidth + perpUnit[1] * halfThickness,
          ],
        ];

        openingCutters.push(cutter);
      }

      // Cut all openings
      if (openingCutters.length > 0) {
        wallPoché = wallPoché.flatMap((poly) =>
          differencePolygons(clipper, poly, openingCutters)
        );
      }
    }

    // Step 4: Render the merged wall poché (single outline, no interior seams)
    const material = floor.walls[0]?.material || "solid";
    const patternId = getMaterialPatternId(material);
    const fillUrl = patternId !== "none" ? `url(#${patternId})` : palette.pochéFill;

    for (const wallPoly of wallPoché) {
      const pathData = polygonToSvg(wallPoly);
      const svg = pathToSvg(
        pathData,
        fillUrl,
        palette.ink,
        getLineweight("heavy", spec.scale, spec.unit)
      );
      layers["A-WALL"].push(svg);
    }
  }

  // ========================================================================
  // Floor slab (outline)
  // ========================================================================

  if (floor.outline) {
    const pathData = polygonToSvg(floor.outline);
    const svg = pathToSvg(
      pathData,
      "none",
      palette.ink,
      getLineweight("light", spec.scale, spec.unit)
    );
    layers["A-FLOR"].push(svg);
  }

  // ========================================================================
  // Rooms (interior polygons with optional fill)
  // ========================================================================

  if (floor.rooms && floor.rooms.length > 0) {
    for (const room of floor.rooms) {
      const pathData = polygonToSvg(room.polygon);
      const fillColor = room.style?.fill || "none";
      const svg = pathToSvg(
        pathData,
        fillColor,
        "none",
        getLineweight("fine", spec.scale, spec.unit)
      );
      layers["A-FLOR"].push(svg);

      // Room label with area on a second line (SVG ignores "\n" in <text>)
      if (room.label) {
        const centroid = getCentroid(room.polygon);
        const area = getPolygonArea(room.polygon);
        const areaText = `${area.toFixed(1)} ${spec.unit}²`;

        const labelText = textLinesToSvg(
          [room.label, areaText],
          centroid[0],
          centroid[1],
          3.5 * mpmm,
          getContrastingTextColor(room.style?.fill, theme),
          "middle"
        );
        layers["A-ANNO-TEXT"].push(labelText);
      }
    }
  }

  // ========================================================================
  // Openings: Doors and Windows
  // ========================================================================

  if (floor.openings && floor.openings.length > 0) {
    for (const opening of floor.openings) {
      const wall = floor.walls?.find((w) => w.id === opening.wallId);
      if (!wall) continue;

      if (opening.type === "door") {
        // Door swing (hinge + swingSide fields)
        const hingeAtStart = opening.hinge === "start";
        const swingRight = opening.swingSide === "right";

        const doorSvg = renderDoorSwing(
          wall.path,
          opening.positionAlongWall,
          opening.width,
          hingeAtStart,
          swingRight,
          theme
        );
        layers["A-DOOR"].push(doorSvg);
      } else if (opening.type === "window") {
        // Window glazing (parallel lines)
        const windowSvg = renderWindowGlazing(
          wall.path,
          opening.positionAlongWall,
          opening.width,
          wall.thickness,
          theme
        );
        layers["A-GLAZ"].push(windowSvg);
      }
    }
  }

  // ========================================================================
  // Dimensions
  // ========================================================================

  if (floor.dimensions && floor.dimensions.length > 0) {
    for (const dim of floor.dimensions) {
      const dimSvg = renderDimensionString(
        dim.from,
        dim.to,
        dim.offset,
        spec.unit,
        theme,
        spec.scale,
        dim.textOverride
      );
      layers["A-ANNO-DIMS"].push(dimSvg);
    }
  }

  // ========================================================================
  // Structural Grid
  // ========================================================================

  if (floor.gridLines && floor.gridLines.length > 0) {
    for (const gridLine of floor.gridLines) {
      // Render grid line as dash-dot with bubbles at ends
      const gridPath = polylineToSvg([gridLine.from, gridLine.to]);
      const gridSvg = pathToSvg(
        gridPath,
        "none",
        palette.ink,
        getLineweight("fine", spec.scale, spec.unit),
        "2,1,0.5,1" // dashdot
      );
      layers["S-GRID"].push(gridSvg);

      // Render label bubbles at specified ends
      const bubbleRadius = 2; // mm
      if (gridLine.bubbleEnds === "start" || gridLine.bubbleEnds === "both") {
        const bubbleSvg = renderGridBubble(
          gridLine.from[0],
          gridLine.from[1],
          gridLine.label,
          bubbleRadius,
          theme,
          spec.scale,
          spec.unit
        );
        layers["S-GRID"].push(bubbleSvg);
      }
      if (gridLine.bubbleEnds === "end" || gridLine.bubbleEnds === "both") {
        const bubbleSvg = renderGridBubble(
          gridLine.to[0],
          gridLine.to[1],
          gridLine.label,
          bubbleRadius,
          theme,
          spec.scale,
          spec.unit
        );
        layers["S-GRID"].push(bubbleSvg);
      }
    }
  }

  // ========================================================================
  // Assemble SVG
  // ========================================================================

  let svgContent = "";
  const layerOrder = [
    "A-FLOR",
    "A-WALL",
    "A-GLAZ",
    "A-DOOR",
    "A-ANNO-DIMS",
    "A-ANNO-TEXT",
    "S-GRID",
  ];

  for (const layerId of layerOrder) {
    if (layers[layerId].length > 0) {
      svgContent += createLayerGroup(layerId, layers[layerId].join("\n"));
    }
  }

  // Compute bbox from floor geometry
  const allPolygons: Polygon[] = [];
  if (floor.outline) allPolygons.push(floor.outline);
  if (floor.walls) {
    // Add wall centerlines as bounding points
    for (const wall of floor.walls) {
      allPolygons.push(wall.path);
    }
  }
  if (floor.rooms) allPolygons.push(...floor.rooms.map((r) => r.polygon));
  // Include annotation geometry so the sheet grows to contain dimension lines
  // (offset outside the building) and structural grid lines + their bubbles,
  // rather than clipping them against the border or overlapping the margins.
  if (floor.dimensions) {
    for (const dim of floor.dimensions) {
      // Endpoints plus the offset line position (perpendicular offset).
      const dx = dim.to[0] - dim.from[0];
      const dy = dim.to[1] - dim.from[1];
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      const px = (-dy / len) * dim.offset;
      const py = (dx / len) * dim.offset;
      allPolygons.push([
        dim.from,
        dim.to,
        [dim.from[0] + px, dim.from[1] + py],
        [dim.to[0] + px, dim.to[1] + py],
      ]);
    }
  }
  if (floor.gridLines) {
    for (const g of floor.gridLines) {
      allPolygons.push([g.from, g.to]);
    }
  }

  const bbox = allPolygons.length > 0 ? getBbox(allPolygons) : { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  // Use generateSheet to wrap content with proper layout
  return generateSheet(svgContent, bbox, spec, theme);
}

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
