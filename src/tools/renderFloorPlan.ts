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
import { renderDoorSwing, renderWindowGlazing, renderDimensionString, renderGridBubble, renderStair, renderLadder } from "../render/symbols.js";
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

    // Referential integrity (Tier 1): every opening must reference a wall that
    // exists in the SAME floor. The Safeguards canvas promises this is rejected
    // "before geometry"; without it a dangling wallId was silently skipped,
    // dropping the opening with no signal to the caller.
    const refError = checkReferentialIntegrity(validSpec);
    if (refError) {
      return createError(refError);
    }

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
    "A-STRS": [],
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
    // Build opening cutters once (an opening belongs to one wall, but the cut
    // is purely geometric; cutting every material group by all cutters means
    // an opening that lands on a material boundary cleanly cuts both groups).
    const openingCutters: Polygon[] = [];
    if (floor.openings && floor.openings.length > 0) {
      for (const opening of floor.openings) {
        const wall = floor.walls.find((w) => w.id === opening.wallId);
        if (!wall) continue;

        const openingPoint = getPointAlongPath(
          wall.path,
          opening.positionAlongWall
        );
        const perpPoint = getPerpendicular(wall.path, opening.positionAlongWall, 1);
        const perpVec = [
          perpPoint[0] - openingPoint[0],
          perpPoint[1] - openingPoint[1],
        ];
        const perpLen = Math.sqrt(perpVec[0] * perpVec[0] + perpVec[1] * perpVec[1]);
        const perpUnit = perpLen > 0 ? [perpVec[0] / perpLen, perpVec[1] / perpLen] : [0, 1];
        const wallUnit = [perpUnit[1], -perpUnit[0]];

        const halfWidth = opening.width / 2;
        const halfThickness = (wall.thickness * 1.5) / 2;

        openingCutters.push([
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
        ]);
      }
    }

    // Group walls by material so each material renders its own hatch. Walls of
    // the SAME material still union together (junctions within a material are
    // seamless); a seam between two DIFFERENT materials is correct — it is a
    // material-change line. Deterministic group order: first-seen order.
    // Only FULL-height walls form cut poché; LOW walls (half/pony/knee walls,
    // railings) are below the cut plane and render as a dashed outline instead.
    const fullWalls = floor.walls.filter((w) => w.heightClass !== "low");
    const lowWalls = floor.walls.filter((w) => w.heightClass === "low");

    const materialOrder: string[] = [];
    const wallsByMaterial = new Map<string, typeof floor.walls>();
    for (const wall of fullWalls) {
      const material = wall.material || "solid";
      if (!wallsByMaterial.has(material)) {
        wallsByMaterial.set(material, []);
        materialOrder.push(material);
      }
      wallsByMaterial.get(material)!.push(wall);
    }

    for (const material of materialOrder) {
      const group = wallsByMaterial.get(material)!;

      // Offset + union this material's walls into one poché.
      const bands: Polygon[] = [];
      for (const wall of group) {
        bands.push(...offsetCenterline(clipper, wall.path, wall.thickness));
      }
      let groupPoché = unionPolygons(clipper, bands);

      // Cut all openings from this group's poché.
      if (openingCutters.length > 0) {
        groupPoché = groupPoché.flatMap((poly) =>
          differencePolygons(clipper, poly, openingCutters)
        );
      }

      wallPoché.push(...groupPoché);

      // Render this material group's poché with its own hatch.
      const patternId = getMaterialPatternId(material);
      const fillUrl = patternId !== "none" ? `url(#${patternId})` : palette.pochéFill;
      for (const wallPoly of groupPoché) {
        const pathData = polygonToSvg(wallPoly);
        layers["A-WALL"].push(
          pathToSvg(
            pathData,
            fillUrl,
            palette.ink,
            getLineweight("heavy", spec.scale, spec.unit)
          )
        );
      }
    }

    // Low walls: offset+union each into its band outline, but render as a
    // DASHED outline with NO fill (standard half-wall / change-in-height
    // convention). They are not part of the cut poché.
    if (lowWalls.length > 0) {
      const lowBands: Polygon[] = [];
      for (const wall of lowWalls) {
        lowBands.push(...offsetCenterline(clipper, wall.path, wall.thickness));
      }
      const lowPoché = unionPolygons(clipper, lowBands);
      const dash = `${formatNumber(1.5 * mpmm)},${formatNumber(1 * mpmm)}`;
      for (const poly of lowPoché) {
        layers["A-WALL"].push(
          pathToSvg(
            polygonToSvg(poly),
            "none",
            palette.ink,
            getLineweight("light", spec.scale, spec.unit),
            dash
          )
        );
      }
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
  // Stairs and Ladders (vertical circulation symbols)
  // ========================================================================

  if (floor.stairs && floor.stairs.length > 0) {
    for (const stair of floor.stairs) {
      layers["A-STRS"].push(
        renderStair(
          stair.footprint,
          stair.run,
          stair.treads,
          stair.direction,
          stair.label,
          spec.scale,
          spec.unit,
          theme
        )
      );
    }
  }

  if (floor.ladders && floor.ladders.length > 0) {
    for (const ladder of floor.ladders) {
      layers["A-STRS"].push(
        renderLadder(ladder.path, ladder.width, spec.scale, spec.unit, theme)
      );
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
    "A-STRS",
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

/**
 * Referential integrity check: every Opening.wallId must reference a Wall that
 * exists within the same Floor. Returns an error message string on the first
 * violation, or null if the spec is clean. This is a cross-array semantic
 * constraint Zod does not express, so it lives here and runs before geometry.
 */
function checkReferentialIntegrity(spec: FloorPlanSpec): string | null {
  for (const floor of spec.floors) {
    if (!floor.openings || floor.openings.length === 0) continue;
    const wallIds = new Set((floor.walls ?? []).map((w) => w.id));
    for (const opening of floor.openings) {
      if (!wallIds.has(opening.wallId)) {
        return (
          `Opening "${opening.id}" references wallId "${opening.wallId}", ` +
          `which does not exist in floor "${floor.id}". Every opening must ` +
          `reference a wall in the same floor.`
        );
      }
    }
  }
  return null;
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
