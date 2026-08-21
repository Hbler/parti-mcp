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
