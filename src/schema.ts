import { z } from "zod";

// Finite number validator - rejects NaN and Infinity
const finiteNumber = z.number().refine((n) => Number.isFinite(n), {
  message: "Coordinate must be a finite number",
});

// Coordinates: array of [number, number] - finite only
export const CoordinatesSchema = z.array(finiteNumber).length(2);

// Coordinates array for polygons and paths
export const CoordinatesArraySchema = z.array(CoordinatesSchema);

// Style: { fill?: string; stroke?: string; strokeWidth?: number; opacity?: number }
export const StyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z
    .number()
    .gt(0, "strokeWidth must be > 0")
    .lt(100, "strokeWidth must be < 100")
    .optional(),
  opacity: z
    .number()
    .gt(0, "opacity must be > 0")
    .lt(100, "opacity must be < 100")
    .optional(),
});

export type Style = z.infer<typeof StyleSchema>;

// Label: { text: string; position?: [number, number] | [number, number, number]; anchorEntityId?: string; size?: number }
export const LabelSchema = z.object({
  text: z.string().min(1).max(500, "text must be <= 500 chars"),
  position: z
    .union([
      z.tuple([finiteNumber, finiteNumber]),
      z.tuple([finiteNumber, finiteNumber, finiteNumber]),
    ])
    .optional(),
  anchorEntityId: z.string().optional(),
  size: z
    .number()
    .gt(0, "size must be > 0")
    .lt(500, "size must be < 500")
    .optional(),
});

export type Label = z.infer<typeof LabelSchema>;

// Block: { id: string; polygon: Coordinates[][]; zone?: string; style?: Style }
export const BlockSchema = z.object({
  id: z.string().min(1).max(100),
  polygon: z
    .array(CoordinatesArraySchema)
    .min(1, "polygon must have at least 1 ring")
    .refine(
      (rings) => rings.every((ring) => ring.length >= 3),
      "each polygon ring must have at least 3 points"
    ),
  zone: z.string().max(100).optional(),
  style: StyleSchema.optional(),
});

export type Block = z.infer<typeof BlockSchema>;

// Building: { id: string; footprint: Coordinates[][]; floorCount?: number; height?: number; label?: Label; style?: Style }
export const BuildingSchema = z.object({
  id: z.string().min(1).max(100),
  footprint: z
    .array(CoordinatesArraySchema)
    .min(1, "footprint must have at least 1 ring")
    .refine(
      (rings) => rings.every((ring) => ring.length >= 3),
      "each footprint ring must have at least 3 points"
    ),
  floorCount: z
    .number()
    .int()
    .gt(0, "floorCount must be > 0")
    .lt(1000, "floorCount must be < 1000")
    .optional(),
  height: z
    .number()
    .gt(0, "height must be > 0")
    .lt(10000, "height must be < 10000")
    .optional(),
  label: LabelSchema.optional(),
  style: StyleSchema.optional(),
});

export type Building = z.infer<typeof BuildingSchema>;

// Road: { id: string; path: Coordinates[]; width: number; type?: string; style?: Style }
export const RoadSchema = z.object({
  id: z.string().min(1).max(100),
  path: CoordinatesArraySchema.min(2, "path must have at least 2 points"),
  width: z
    .number()
    .gt(0, "width must be > 0")
    .lt(1000, "width must be < 1000"),
  type: z.string().max(100).optional(),
  style: StyleSchema.optional(),
});

export type Road = z.infer<typeof RoadSchema>;

// GreenSpace: { id: string; polygon: Coordinates[][]; style?: Style }
export const GreenSpaceSchema = z.object({
  id: z.string().min(1).max(100),
  polygon: z
    .array(CoordinatesArraySchema)
    .min(1, "polygon must have at least 1 ring")
    .refine(
      (rings) => rings.every((ring) => ring.length >= 3),
      "each polygon ring must have at least 3 points"
    ),
  style: StyleSchema.optional(),
});

export type GreenSpace = z.infer<typeof GreenSpaceSchema>;

// Room: interior space within a floor
export const RoomSchema = z.object({
  id: z.string().min(1).max(100),
  polygon: z
    .array(CoordinatesArraySchema)
    .min(1, "polygon must have at least 1 ring")
    .refine(
      (rings) => rings.every((ring) => ring.length >= 3),
      "each polygon ring must have at least 3 points"
    ),
  roomType: z.string(), // e.g., "bedroom", "kitchen", "bathroom", "living", "hallway", "other"
  label: LabelSchema.optional(),
  style: StyleSchema.optional(),
});

export type Room = z.infer<typeof RoomSchema>;

// Wall: interior divider in a floor
export const WallSchema = z.object({
  id: z.string().min(1).max(100),
  path: CoordinatesArraySchema.min(2, "path must have at least 2 points"),
  thickness: z
    .number()
    .gt(0, "thickness must be > 0")
    .lt(1000, "thickness must be < 1000"),
  style: StyleSchema.optional(),
});

export type Wall = z.infer<typeof WallSchema>;

// Opening: door or window in a wall
export const OpeningSchema = z.object({
  id: z.string().min(1).max(100),
  wallId: z.string(), // references Wall.id in same Floor
  positionAlongWall: z
    .number()
    .gte(0, "positionAlongWall must be >= 0")
    .lte(1, "positionAlongWall must be <= 1"),
  width: z
    .number()
    .gt(0, "width must be > 0")
    .lt(100, "width must be < 100"),
  type: z.string(), // e.g., "door", "window"
  style: StyleSchema.optional(),
});

export type Opening = z.infer<typeof OpeningSchema>;

// Floor: single level of a building
export const FloorSchema = z
  .object({
    id: z.string().min(1).max(100),
    level: z.number().int().gte(0, "level must be >= 0"),
    outline: z
      .array(CoordinatesArraySchema)
      .min(1, "outline must have at least 1 ring")
      .refine(
        (rings) => rings.every((ring) => ring.length >= 3),
        "each outline ring must have at least 3 points"
      ),
    label: z.string().optional(),
    rooms: z.array(RoomSchema).max(100).optional(),
    walls: z.array(WallSchema).max(200).optional(),
    openings: z.array(OpeningSchema).max(200).optional(),
  })
  .refine(
    (floor) => {
      if (!floor.walls) return true;
      const wallIds = new Set(floor.walls.map((w) => w.id));
      if (!floor.openings) return true;
      for (const opening of floor.openings) {
        if (!wallIds.has(opening.wallId)) {
          return false;
        }
      }
      return true;
    },
    { message: "Opening references non-existent wall" }
  );

export type Floor = z.infer<typeof FloorSchema>;

// FloorPlanSpec: entire building
export const FloorPlanSpecSchema = z.object({
  buildingLabel: z.string().optional(),
  units: z.string().max(50).optional(),
  theme: z.string().optional(),
  floors: z
    .array(FloorSchema)
    .min(1, "floors must have at least 1 floor")
    .max(100, "floors must have at most 100 floors"),
});

export type FloorPlanSpec = z.infer<typeof FloorPlanSpecSchema>;

// MapSpec: root entity
export const MapSpecSchema = z
  .object({
    bounds: z
      .tuple([finiteNumber, finiteNumber, finiteNumber, finiteNumber])
      .refine(
        ([minX, minY, maxX, maxY]) => minX < maxX && minY < maxY,
        "bounds must have minX < maxX and minY < maxY"
      )
      .optional(),
    units: z.string().max(50).optional(),
    background: z.string().optional(),
    theme: z.string().max(100).optional(),
    blocks: z.array(BlockSchema).max(500).optional(),
    buildings: z.array(BuildingSchema).max(500).optional(),
    roads: z.array(RoadSchema).max(200).optional(),
    greenspaces: z.array(GreenSpaceSchema).optional(),
  })
  .refine(
    (obj) => {
      const hasBlocks = obj.blocks && obj.blocks.length > 0;
      const hasBuildings = obj.buildings && obj.buildings.length > 0;
      const hasRoads = obj.roads && obj.roads.length > 0;
      const hasGreenspaces = obj.greenspaces && obj.greenspaces.length > 0;
      return hasBlocks || hasBuildings || hasRoads || hasGreenspaces;
    },
    "MapSpec must have at least one of: blocks, buildings, roads, or greenspaces"
  );

export type MapSpec = z.infer<typeof MapSpecSchema>;
