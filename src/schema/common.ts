/**
 * schema/common.ts — Common schemas for DocumentMeta, Style, Label, Dimension, GridLine
 * Zod is the single source of truth; no hand-duplicated types
 */

import { z } from "zod";

// ============================================================================
// Enums and Constants
// ============================================================================

export const UnitSchema = z.enum(["mm", "cm", "m", "ft", "in"]);
export type Unit = z.infer<typeof UnitSchema>;

export const ScaleSchema = z
  .string()
  .regex(/^1:\d+$/, "Scale must be in '1:N' format")
  .refine((s) => {
    const match = s.match(/^1:(\d+)$/);
    return match && parseInt(match[1], 10) > 0;
  }, "Denominator must be positive");
export type Scale = string; // just a string type

export const ThemeSchema = z.enum(["blueprint", "whiteprint"]);
export type Theme = z.infer<typeof ThemeSchema>;

export const LineweightSchema = z.enum(["heavy", "medium", "light", "fine"]);
export type Lineweight = z.infer<typeof LineweightSchema>;

export const LinetypeSchema = z.enum(["solid", "dashed", "dashdot"]);
export type Linetype = z.infer<typeof LinetypeSchema>;

export const MaterialSchema = z.enum([
  "solid",
  "concrete",
  "brick",
  "masonry",
  "insulation",
  "earth",
  "wood",
]);
export type Material = z.infer<typeof MaterialSchema>;

// ============================================================================
// Safe Color Token (injection guard)
// ============================================================================

/**
 * Safe color token: only hex colors (#rgb or #rrggbb) or a curated named list
 * This closes the style-injection vector by validating before SVG interpolation
 */
export const ColorTokenSchema = z
  .string()
  .regex(
    /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/,
    "Must be hex color (#rgb or #rrggbb)"
  )
  .or(
    z.enum([
      "white",
      "black",
      "red",
      "green",
      "blue",
      "cyan",
      "gray",
      "lightblue",
      "darkblue",
    ])
  );
export type ColorToken = z.infer<typeof ColorTokenSchema>;

// ============================================================================
// Document Metadata
// ============================================================================

export const TitleBlockSchema = z.object({
  title: z.string().optional(),
  drawingNumber: z.string().optional(),
  date: z.string().optional(),
  project: z.string().optional(),
  northAngle: z.number().optional().default(0),
});
export type TitleBlock = z.infer<typeof TitleBlockSchema>;

export const DocumentMetaSchema = z.object({
  unit: UnitSchema,
  scale: ScaleSchema,
  theme: ThemeSchema.optional().default("blueprint"),
  titleBlock: TitleBlockSchema.optional(),
});
export type DocumentMeta = z.infer<typeof DocumentMetaSchema>;

// ============================================================================
// Style (per-element overrides)
// ============================================================================

export const StyleSchema = z.object({
  fill: ColorTokenSchema.optional(),
  stroke: ColorTokenSchema.optional(),
  lineweight: LineweightSchema.optional(),
  linetype: LinetypeSchema.optional(),
  hatch: MaterialSchema.or(z.literal("none")).optional(),
});
export type Style = z.infer<typeof StyleSchema>;

// ============================================================================
// Label
// ============================================================================

export const LabelSchema = z.object({
  text: z.string(),
  position: z.tuple([z.number(), z.number()]).optional(),
  anchorEntityId: z.string().optional(),
  heightMm: z.number().optional(),
  tag: z.boolean().optional(),
});
export type Label = z.infer<typeof LabelSchema>;

// ============================================================================
// Dimension
// ============================================================================

export const DimensionSchema = z.object({
  from: z.tuple([z.number(), z.number()]),
  to: z.tuple([z.number(), z.number()]),
  offset: z.number(),
  textOverride: z.string().optional(),
});
export type Dimension = z.infer<typeof DimensionSchema>;

// ============================================================================
// GridLine
// ============================================================================

export const GridLineSchema = z.object({
  label: z.string(),
  from: z.tuple([z.number(), z.number()]),
  to: z.tuple([z.number(), z.number()]),
  bubbleEnds: z.enum(["start", "end", "both"]),
});
export type GridLine = z.infer<typeof GridLineSchema>;

// ============================================================================
// Coordinate Validation
// ============================================================================

export function validateCoordinate(coord: unknown): [number, number] {
  const result = z
    .tuple([z.number().finite(), z.number().finite()])
    .safeParse(coord);

  if (!result.success) {
    throw new Error(`Invalid coordinate: ${JSON.stringify(coord)}`);
  }

  return result.data;
}

export function validateCoordinates(coords: unknown): [number, number][] {
  const result = z
    .array(z.tuple([z.number().finite(), z.number().finite()]))
    .safeParse(coords);

  if (!result.success) {
    throw new Error(`Invalid coordinates: ${JSON.stringify(coords)}`);
  }

  return result.data;
}
