/**
 * schema/site.ts — Site plan entities (Building, Parcel, Road, PavedArea, Water, GreenSpace, Barrier, Tree)
 */

import { z } from "zod";
import {
  DocumentMetaSchema,
  StyleSchema,
  LabelSchema,
  DimensionSchema,
  GridLineSchema,
  LabelOrientationSchema,
  LabelPositionSchema,
} from "./common.js";

// ============================================================================
// Enums for Site Entities
// ============================================================================

export const RoadTypeSchema = z.enum(["arterial", "local", "pedestrian"]);
export type RoadType = z.infer<typeof RoadTypeSchema>;

export const SurfaceTypeSchema = z.enum([
  "concrete",
  "asphalt",
  "pavers",
  "gravel",
  "patio",
  "deck",
  "driveway",
  "sidewalk",
]);
export type SurfaceType = z.infer<typeof SurfaceTypeSchema>;

export const WaterTypeSchema = z.enum(["pool", "pond", "fountain"]);
export type WaterType = z.infer<typeof WaterTypeSchema>;

export const LandscapeTypeSchema = z.enum([
  "lawn",
  "garden",
  "planting",
  "park",
  "meadow",
]);
export type LandscapeType = z.infer<typeof LandscapeTypeSchema>;

export const BarrierTypeSchema = z.enum(["fence", "wall", "hedge", "gate"]);
export type BarrierType = z.infer<typeof BarrierTypeSchema>;

// ============================================================================
// Curve schemas (circular arcs only, tessellated via geometry/tessellateArc)
// ============================================================================

/**
 * Circular-arc curve for a road whose `path` has exactly two points — same
 * model as a curved wall. `clockwise` picks which side the arc bulges toward.
 */
export const RoadCurveSchema = z.object({
  radius: z.number().positive(),
  clockwise: z.boolean().default(false),
});
export type RoadCurve = z.infer<typeof RoadCurveSchema>;

/**
 * A single curve applied to a building footprint. Targets EITHER an edge (a
 * bowed facade) or a corner (a rounded/filleted corner).
 *
 * - edge bow: set `edge` (the edge from vertex `edge`→`edge+1`) + `radius`.
 * - corner round: set `corner` (the vertex index). Mode by presence of fields:
 *     setbacks + radius → free arc through the two setback points at `radius`
 *     setbacks only     → free arc fit through the two setback points
 *     radius only       → tangent fillet (setbacks computed from the angle)
 *     neither           → invalid (refinement error)
 */
export const FootprintCurveSchema = z
  .object({
    edge: z.number().int().nonnegative().optional(),
    corner: z.number().int().nonnegative().optional(),
    setbackIn: z.number().positive().optional(),
    setbackOut: z.number().positive().optional(),
    radius: z.number().positive().optional(),
    clockwise: z.boolean().optional(),
  })
  .refine((c) => (c.edge === undefined) !== (c.corner === undefined), {
    message: "A footprintCurve must target exactly one of `edge` or `corner`.",
  })
  .refine((c) => c.edge === undefined || c.radius !== undefined, {
    message: "An edge bow requires `radius`.",
  })
  .refine(
    (c) =>
      c.corner === undefined ||
      c.radius !== undefined ||
      c.setbackIn !== undefined ||
      c.setbackOut !== undefined,
    { message: "A corner round requires `radius` or setback(s)." }
  );
export type FootprintCurve = z.infer<typeof FootprintCurveSchema>;

// ============================================================================
// Site Entities
// ============================================================================

/**
 * Building footprint (exterior site plan)
 */
export const BuildingSchema = z.object({
  id: z.string(),
  footprint: z.array(z.tuple([z.number(), z.number()])).min(3),
  footprintCurves: z.array(FootprintCurveSchema).optional(),
  label: z.string().optional(),
  labelOrientation: LabelOrientationSchema.optional(),
  labelPosition: LabelPositionSchema.optional(),
  floors: z.number().optional(),
  height: z.number().optional(),
  style: StyleSchema.optional(),
});
export type Building = z.infer<typeof BuildingSchema>;

/**
 * Parcel / lot line
 */
export const ParcelSchema = z.object({
  id: z.string(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  zone: z.string().optional(),
  style: StyleSchema.optional(),
});
export type Parcel = z.infer<typeof ParcelSchema>;

/**
 * Road (centerline + width)
 * Offset to create carriageway; union at intersections
 */
export const RoadSchema = z.object({
  id: z.string(),
  path: z.array(z.tuple([z.number(), z.number()])).min(2),
  width: z.number().positive(),
  type: RoadTypeSchema.optional(),
  curve: RoadCurveSchema.optional(),
  style: StyleSchema.optional(),
});
export type Road = z.infer<typeof RoadSchema>;

/**
 * Paved area (hardscape: sidewalks, driveways, patios, decks, parking, etc.)
 * Markings: array of polylines [[x,y], ...], rendered as fine open lines
 */
export const PavedAreaMarkingSchema = z.object({
  path: z.array(z.tuple([z.number(), z.number()])).min(2),
});

export const PavedAreaSchema = z.object({
  id: z.string(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  surface: SurfaceTypeSchema,
  markings: z.array(PavedAreaMarkingSchema).optional(),
  label: z.string().optional(),
  labelOrientation: LabelOrientationSchema.optional(),
  labelPosition: LabelPositionSchema.optional(),
  /**
   * When true, render this paved area ABOVE water (a deck/boardwalk/jetty over
   * a pond or pool). Default false: renders as ground-level hardscape (below
   * water). Default-false keeps existing plans byte-identical.
   */
  elevated: z.boolean().optional(),
  style: StyleSchema.optional(),
});
export type PavedArea = z.infer<typeof PavedAreaSchema>;
export type PavedAreaMarking = z.infer<typeof PavedAreaMarkingSchema>;

/**
 * Water feature (pool, pond, fountain)
 */
export const WaterSchema = z.object({
  id: z.string(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  waterType: WaterTypeSchema.optional(),
  label: z.string().optional(),
  labelOrientation: LabelOrientationSchema.optional(),
  labelPosition: LabelPositionSchema.optional(),
  style: StyleSchema.optional(),
});
export type Water = z.infer<typeof WaterSchema>;

/**
 * Green space (lawn, garden, planting area, park)
 */
export const GreenSpaceSchema = z.object({
  id: z.string(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  landscapeType: LandscapeTypeSchema,
  label: z.string().optional(),
  labelOrientation: LabelOrientationSchema.optional(),
  labelPosition: LabelPositionSchema.optional(),
  style: StyleSchema.optional(),
});
export type GreenSpace = z.infer<typeof GreenSpaceSchema>;

/**
 * Barrier (fence, wall, hedge, gate)
 */
export const BarrierSchema = z.object({
  id: z.string(),
  path: z.array(z.tuple([z.number(), z.number()])).min(2),
  barrierType: BarrierTypeSchema,
  style: StyleSchema.optional(),
});
export type Barrier = z.infer<typeof BarrierSchema>;

/**
 * Tree
 */
export const TreeSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number()]),
  radius: z.number().positive(),
  species: z.string().optional(),
  style: StyleSchema.optional(),
});
export type Tree = z.infer<typeof TreeSchema>;

// ============================================================================
// Site Plan Spec (root)
// ============================================================================

export const SiteSpecSchema = DocumentMetaSchema.extend({
  buildings: z.array(BuildingSchema).optional(),
  parcels: z.array(ParcelSchema).optional(),
  roads: z.array(RoadSchema).optional(),
  pavedAreas: z.array(PavedAreaSchema).optional(),
  water: z.array(WaterSchema).optional(),
  greenSpaces: z.array(GreenSpaceSchema).optional(),
  barriers: z.array(BarrierSchema).optional(),
  trees: z.array(TreeSchema).optional(),
  dimensions: z.array(DimensionSchema).optional(),
  gridLines: z.array(GridLineSchema).optional(),
});
export type SiteSpec = z.infer<typeof SiteSpecSchema>;
