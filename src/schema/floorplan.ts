/**
 * schema/floorplan.ts — Floor plan entities (Floor, Room, Wall, Opening)
 * Rooms authored to interior wall face (honest area); wall centerlines offset separately
 */

import { z } from "zod";
import {
  DocumentMetaSchema,
  StyleSchema,
  DimensionSchema,
  GridLineSchema,
  LabelOrientationSchema,
  LabelPositionSchema,
} from "./common.js";

// ============================================================================
// Enums
// ============================================================================

export const RoomTypeSchema = z.enum([
  "bedroom",
  "kitchen",
  "bathroom",
  "living",
  "hallway",
  "circulation",
  "other",
]);
export type RoomType = z.infer<typeof RoomTypeSchema>;

export const OpeningTypeSchema = z.enum(["door", "window"]);
export type OpeningType = z.infer<typeof OpeningTypeSchema>;

export const HingeSchema = z.enum(["start", "end"]);
export type Hinge = z.infer<typeof HingeSchema>;

export const SwingSideSchema = z.enum(["left", "right"]);
export type SwingSide = z.infer<typeof SwingSideSchema>;

export const WallHeightClassSchema = z.enum(["full", "low"]);
export type WallHeightClass = z.infer<typeof WallHeightClassSchema>;

export const StairDirectionSchema = z.enum(["up", "down"]);
export type StairDirection = z.infer<typeof StairDirectionSchema>;

export const ColumnShapeSchema = z.enum(["square", "rectangular", "round"]);
export type ColumnShape = z.infer<typeof ColumnShapeSchema>;

/**
 * Optional circular-arc curve for a wall whose `path` has exactly two points.
 * The server fits an arc through the two endpoints at `radius` and tessellates
 * it before offsetting. `clockwise` picks which side the arc bulges toward.
 */
export const WallCurveSchema = z.object({
  radius: z.number().positive(),
  clockwise: z.boolean().default(false),
});
export type WallCurve = z.infer<typeof WallCurveSchema>;

// ============================================================================
// Floor Plan Entities
// ============================================================================

/**
 * Room (polygon, interior face)
 * Area computed from the polygon as authored (no derivation from walls)
 */
export const RoomSchema = z.object({
  id: z.string(),
  polygon: z.array(z.tuple([z.number(), z.number()])).min(3),
  roomType: RoomTypeSchema.optional(),
  label: z.string().optional(),
  labelOrientation: LabelOrientationSchema.optional(),
  labelPosition: LabelPositionSchema.optional(),
  style: StyleSchema.optional(),
});
export type Room = z.infer<typeof RoomSchema>;

/**
 * Wall (centerline + thickness)
 * Offset to band, unioned with other walls of the floor
 */
export const WallSchema = z.object({
  id: z.string(),
  path: z.array(z.tuple([z.number(), z.number()])).min(2),
  thickness: z.number().positive(),
  material: z.string().optional(),
  // "full" (default) = full-height cut wall (solid poché). "low" = half/pony/
  // knee wall or railing, below the ~1.2m cut plane → drawn as a dashed
  // outline with no poché fill (standard "dashed = half-wall" convention).
  heightClass: WallHeightClassSchema.optional().default("full"),
  // Optional circular arc: only valid when `path` has exactly two points.
  curve: WallCurveSchema.optional(),
  style: StyleSchema.optional(),
});
export type Wall = z.infer<typeof WallSchema>;

/**
 * Opening (door or window in a wall)
 * Position along wall [0, 1]; door uses hinge + swingSide (two fields)
 */
export const OpeningSchema = z.object({
  id: z.string(),
  wallId: z.string(), // Must reference a Wall in same Floor
  positionAlongWall: z.number().min(0).max(1),
  width: z.number().positive(),
  type: OpeningTypeSchema,
  // Door swing specification (both fields required for doors)
  hinge: HingeSchema.optional(), // "start" or "end" jamb
  swingSide: SwingSideSchema.optional(), // "left" or "right"
});
export type Opening = z.infer<typeof OpeningSchema>;

/**
 * Stair (straight run, plan symbol)
 * `run` is the travel centerline: run[0] = bottom (lowest riser), run[1] = top.
 * Treads are drawn perpendicular to `run`; the direction arrow follows `run`
 * from bottom to top; a diagonal break line crosses the flight at the cut.
 */
export const StairSchema = z.object({
  id: z.string(),
  footprint: z.array(z.tuple([z.number(), z.number()])).min(3),
  run: z.tuple([
    z.tuple([z.number(), z.number()]),
    z.tuple([z.number(), z.number()]),
  ]),
  treads: z.number().int().min(2),
  direction: StairDirectionSchema.default("up"),
  label: z.string().optional(), // overrides the default "UP"/"DN"
  style: StyleSchema.optional(),
});
export type Stair = z.infer<typeof StairSchema>;

/**
 * Ladder (schematic top view: two rails + rungs)
 * `path` is the rail centerline (start→end); `width` is the rail separation.
 */
export const LadderSchema = z.object({
  id: z.string(),
  path: z.tuple([
    z.tuple([z.number(), z.number()]),
    z.tuple([z.number(), z.number()]),
  ]),
  width: z.number().positive(),
  style: StyleSchema.optional(),
});
export type Ladder = z.infer<typeof LadderSchema>;

/**
 * Elevator (hoistway/shaft, plan symbol).
 * `footprint` is the shaft rectangle; the server draws the car as an inset
 * rectangle plus an X (both diagonals) marking the shaft. Optional `label`
 * (e.g. "ELEV").
 */
export const ElevatorSchema = z.object({
  id: z.string(),
  footprint: z.array(z.tuple([z.number(), z.number()])).min(3),
  label: z.string().optional(),
  style: StyleSchema.optional(),
});
export type Elevator = z.infer<typeof ElevatorSchema>;

/**
 * Column / pier / isolated masonry pad (structural point element).
 * Drawn as its plan footprint filled with poché or a material hatch.
 *  - square:      `size` (side length)
 *  - rectangular: `width` × `depth`
 *  - round:       `size` (diameter)
 */
export const ColumnSchema = z.object({
  id: z.string(),
  position: z.tuple([z.number(), z.number()]),
  shape: ColumnShapeSchema.default("square"),
  size: z.number().positive().optional(), // square side / round diameter
  width: z.number().positive().optional(), // rectangular
  depth: z.number().positive().optional(), // rectangular
  material: z.string().optional(),
  style: StyleSchema.optional(),
});
export type Column = z.infer<typeof ColumnSchema>;

/**
 * Floor (one level of a building)
 */
export const FloorSchema = z.object({
  id: z.string(),
  level: z.number().int().default(0),
  outline: z.array(z.tuple([z.number(), z.number()])).min(3).optional(),
  label: z.string().optional(),
  rooms: z.array(RoomSchema).optional(),
  walls: z.array(WallSchema).optional(),
  openings: z.array(OpeningSchema).optional(),
  stairs: z.array(StairSchema).optional(),
  ladders: z.array(LadderSchema).optional(),
  elevators: z.array(ElevatorSchema).optional(),
  columns: z.array(ColumnSchema).optional(),
  dimensions: z.array(DimensionSchema).optional(),
  gridLines: z.array(GridLineSchema).optional(),
});
export type Floor = z.infer<typeof FloorSchema>;

// ============================================================================
// Floor Plan Spec (root)
// ============================================================================

export const FloorPlanSpecSchema = DocumentMetaSchema.extend({
  floors: z.array(FloorSchema).min(1),
});
export type FloorPlanSpec = z.infer<typeof FloorPlanSpecSchema>;
