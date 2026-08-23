/**
 * tools/renderSitePlan.ts — Render site plan from SiteSpec
 * CRITICAL: offset→union→cut→stroke pipeline for roads and figure-ground
 */

import { SiteSpecSchema, type SiteSpec } from "../schema/site.js";
import { getClipper } from "../geometry/clipper.js";
import {
  offsetCenterline,
  unionPolygons,
  differencePolygons,
  type Polygon,
} from "../geometry/clipper.js";
import { getBbox, getCentroid } from "../geometry/primitives.js";
import { modelPerPaperMm } from "../geometry/scale.js";
import { createLayerGroup } from "../render/layers.js";
import {
  polygonToSvg,
  polylineToSvg,
  pathToSvg,
  circleToSvg,
  textLinesWithHaloToSvg,
  resolveLabelAnchor,
  formatNumber,
} from "../render/primitives.js";
import { getTheme, getLineweight, resolveColor, getContrastingTextColor } from "../render/theme.js";
import { getMaterialPatternId } from "../render/defs.js";
import { renderScaleBar, renderBarrier } from "../render/symbols.js";
import { generateSheet } from "../render/sheet.js";

export interface ToolResult {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

/**
 * Handle render_site_plan tool request
 */
export async function handleRenderSitePlan(
  args: Record<string, unknown>
): Promise<ToolResult> {
  try {
    // Parse and validate spec
    const specInput = args.spec;
    if (!specInput) {
      return createError("spec is required");
    }

    let spec: SiteSpec;
    if (typeof specInput === "string") {
      try {
        spec = JSON.parse(specInput);
      } catch (e) {
        return createError(`Invalid JSON: ${String(e)}`);
      }
    } else {
      spec = specInput as SiteSpec;
    }

    // Validate with Zod
    const validation = SiteSpecSchema.safeParse(spec);
    if (!validation.success) {
      return createError(`Spec validation failed: ${validation.error.message}`);
    }

    const validSpec = validation.data;

    // Render the site plan
    const svg = renderSitePlan(validSpec);

    return {
      content: [
        {
          type: "text",
          text: svg,
        },
      ],
    };
  } catch (err) {
    return createError(`render_site_plan failed: ${String(err)}`);
  }
}

/**
 * Render the site plan SVG
 */
function renderSitePlan(spec: SiteSpec): string {
  const clipper = getClipper();
  const theme = spec.theme || "blueprint";
  const palette = getTheme(theme);
  const mpmm = modelPerPaperMm(spec.scale, spec.unit);
  // Site labels are authored in paper-mm like all annotation; 3mm reads well.
  const labelSize = 3 * mpmm;

  const layers: Record<string, string[]> = {
    "V-PROP": [],
    "C-ROAD": [],
    "L-HARD": [],
    "L-WATR": [],
    "L-DECK": [],
    "L-PLNT": [],
    "L-SITE": [],
    "A-BLDG": [],
    "A-ANNO-DIMS": [],
    "A-ANNO-TEXT": [],
  };

  // ========================================================================
  // CRITICAL JUNCTION PIPELINE: Roads
  // offset each road centerline → union all → stroke once
  // ========================================================================

  if (spec.roads && spec.roads.length > 0) {
    // Step 1: Offset each road centerline to create bands
    const roadBands: Polygon[] = [];
    for (const road of spec.roads) {
      const bands = offsetCenterline(clipper, road.path, road.width);
      roadBands.push(...bands);
    }

    // Step 2: Union all road bands into one merged polygon
    const mergedRoads = unionPolygons(clipper, roadBands);

    // Step 3: Stroke the merged result as ONE path with fill-rule="evenodd".
    // The union of a branching road network returns enclosed gaps between
    // spurs (and any true holes) as separate opposite-winding paths. Emitting
    // each returned path as its own SOLID fill would flood those gaps — a gap
    // between two close parallel spurs paints as a filled block, bridging what
    // should stay open (and silently covering whatever is underneath, e.g.
    // lawn/trees). As subpaths of one even-odd path, those gaps become holes
    // and only the actual carriageway is filled. (Same fix as the wall poché.)
    if (mergedRoads.length > 0) {
      const combined = mergedRoads.map((poly) => polygonToSvg(poly)).join(" ");
      const stroke = resolveColor(spec.roads[0].style?.stroke, theme);
      layers["C-ROAD"].push(
        pathToSvg(
          combined,
          palette.ink,
          stroke,
          getLineweight("medium", spec.scale, spec.unit),
          undefined,
          "evenodd"
        )
      );
    }
  }

  // ========================================================================
  // Figure-Ground: Buildings
  // ========================================================================

  if (spec.buildings && spec.buildings.length > 0) {
    // Render each building as its own figure-ground poché so a per-building
    // `style.fill` highlight is honored (unioning all footprints would collapse
    // them to a single fill). Distinct footprints already read as figure-ground.
    for (const building of spec.buildings) {
      const pathData = polygonToSvg(building.footprint);
      const fill = building.style?.fill || palette.buildingFill;
      const svg = pathToSvg(
        pathData,
        fill,
        palette.ink,
        getLineweight("heavy", spec.scale, spec.unit)
      );
      layers["A-BLDG"].push(svg);

      if (building.label) {
        const a = resolveLabelAnchor(building.footprint, building.labelPosition ?? "center", labelSize);
        layers["A-ANNO-TEXT"].push(
          textLinesWithHaloToSvg([building.label], a.x, a.y, labelSize, getContrastingTextColor(fill, theme), fill, a.textAnchor, building.labelOrientation ?? "horizontal", a.verticalBias)
        );
      }
    }
  }

  // ========================================================================
  // Parcels (property/lot lines) — dash-dot
  // ========================================================================

  if (spec.parcels && spec.parcels.length > 0) {
    for (const parcel of spec.parcels) {
      const pathData = polygonToSvg(parcel.polygon);
      const svg = pathToSvg(
        pathData,
        "none",
        palette.ink,
        getLineweight("light", spec.scale, spec.unit),
        "2,1,0.5,1" // dashdot
      );
      layers["V-PROP"].push(svg);
    }
  }

  // ========================================================================
  // Paved Areas (hardscape)
  // ========================================================================

  if (spec.pavedAreas && spec.pavedAreas.length > 0) {
    for (const paved of spec.pavedAreas) {
      const pathData = polygonToSvg(paved.polygon);
      const patternId = getMaterialPatternId(paved.surface);
      const fillUrl = patternId !== "none" ? `url(#${patternId})` : palette.pochéFill;

      // Elevated paved areas (deck/boardwalk/jetty over water) paint on L-DECK,
      // above the water layer; ground-level hardscape stays on L-HARD.
      const pavedLayer = paved.elevated ? "L-DECK" : "L-HARD";

      const svg = pathToSvg(
        pathData,
        fillUrl,
        palette.ink,
        getLineweight("light", spec.scale, spec.unit)
      );
      layers[pavedLayer].push(svg);

      if (paved.surface) {
        const a = resolveLabelAnchor(paved.polygon, paved.labelPosition ?? "center", labelSize);
        layers["A-ANNO-TEXT"].push(
          textLinesWithHaloToSvg(
            [paved.label ?? titleCase(paved.surface)],
            a.x, a.y, labelSize, palette.ink, palette.background, a.textAnchor,
            paved.labelOrientation ?? "horizontal", a.verticalBias
          )
        );
      }

      // Render markings (parking stalls, crosswalks, etc.)
      if (paved.markings && paved.markings.length > 0) {
        for (const marking of paved.markings) {
          const markingPath = polylineToSvg(marking.path);
          const markingSvg = pathToSvg(
            markingPath,
            "none",
            palette.ink,
            getLineweight("fine", spec.scale, spec.unit)
          );
          layers[pavedLayer].push(markingSvg);
        }
      }
    }
  }

  // ========================================================================
  // Water Features
  // ========================================================================

  if (spec.water && spec.water.length > 0) {
    for (const waterFeature of spec.water) {
      const pathData = polygonToSvg(waterFeature.polygon);
      const svg = pathToSvg(
        pathData,
        "#4DD0E1", // light blue
        palette.ink,
        getLineweight("medium", spec.scale, spec.unit)
      );
      layers["L-WATR"].push(svg);

      if (waterFeature.label ?? waterFeature.waterType) {
        const a = resolveLabelAnchor(waterFeature.polygon, waterFeature.labelPosition ?? "center", labelSize);
        layers["A-ANNO-TEXT"].push(
          textLinesWithHaloToSvg(
            [waterFeature.label ?? titleCase(waterFeature.waterType!)],
            a.x, a.y, labelSize, palette.ink, palette.background, a.textAnchor,
            waterFeature.labelOrientation ?? "horizontal", a.verticalBias
          )
        );
      }
    }
  }

  // ========================================================================
  // Green Space (landscaping)
  // ========================================================================

  if (spec.greenSpaces && spec.greenSpaces.length > 0) {
    for (const green of spec.greenSpaces) {
      const pathData = polygonToSvg(green.polygon);
      const patternId = getMaterialPatternId(green.landscapeType);
      const fillUrl = patternId !== "none" ? `url(#${patternId})` : "#90EE90";

      const svg = pathToSvg(
        pathData,
        fillUrl,
        palette.ink,
        getLineweight("light", spec.scale, spec.unit)
      );
      layers["L-PLNT"].push(svg);

      if (green.label ?? green.landscapeType) {
        const a = resolveLabelAnchor(green.polygon, green.labelPosition ?? "center", labelSize);
        layers["A-ANNO-TEXT"].push(
          textLinesWithHaloToSvg(
            [green.label ?? titleCase(green.landscapeType)],
            a.x, a.y, labelSize, palette.ink, palette.background, a.textAnchor,
            green.labelOrientation ?? "horizontal", a.verticalBias
          )
        );
      }
    }
  }

  // ========================================================================
  // Barriers (fences, walls, hedges)
  // ========================================================================

  if (spec.barriers && spec.barriers.length > 0) {
    for (const barrier of spec.barriers) {
      const svg = renderBarrier(
        barrier.path,
        barrier.barrierType,
        spec.scale,
        spec.unit,
        theme
      );
      layers["L-SITE"].push(svg);
    }
  }

  // ========================================================================
  // Trees
  // ========================================================================

  if (spec.trees && spec.trees.length > 0) {
    for (const tree of spec.trees) {
      const svg = circleToSvg(
        tree.position[0],
        tree.position[1],
        tree.radius,
        "none",
        palette.ink,
        getLineweight("light", spec.scale, spec.unit)
      );
      layers["L-PLNT"].push(svg);
    }
  }

  // ========================================================================
  // Assemble SVG from layers
  // ========================================================================

  let svgContent = "";
  const layerOrder = [
    "V-PROP",
    "C-ROAD",
    "L-HARD",
    "L-WATR",
    "L-DECK",
    "L-PLNT",
    "L-SITE",
    "A-BLDG",
    "A-ANNO-DIMS",
    "A-ANNO-TEXT",
  ];

  for (const layerId of layerOrder) {
    if (layers[layerId].length > 0) {
      svgContent += createLayerGroup(layerId, layers[layerId].join("\n"));
    }
  }

  // Collect all polygons for bbox
  const allPolygons: Polygon[] = [];
  if (spec.buildings) allPolygons.push(...spec.buildings.map((b) => b.footprint));
  if (spec.parcels) allPolygons.push(...spec.parcels.map((p) => p.polygon));
  if (spec.pavedAreas) allPolygons.push(...spec.pavedAreas.map((a) => a.polygon));
  if (spec.water) allPolygons.push(...spec.water.map((w) => w.polygon));
  if (spec.greenSpaces) allPolygons.push(...spec.greenSpaces.map((g) => g.polygon));

  // Compute bbox for sheet layout
  const bbox = allPolygons.length > 0 ? getBbox(allPolygons) : { minX: 0, minY: 0, maxX: 100, maxY: 100 };

  // Create wrapper SVG with metadata
  const meta = {
    unit: spec.unit,
    scale: spec.scale,
    theme: theme,
    titleBlock: spec.titleBlock,
  };

  // Generate complete sheet with proper layout, title block, north arrow, scale bar
  return generateSheet(svgContent, bbox, meta, theme);
}

function titleCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
