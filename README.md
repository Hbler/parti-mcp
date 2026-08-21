# plan-mcp v2

An MCP server that renders architectural floor plans and site plans as SVG in a blueprint aesthetic, following real architectural drawing conventions. Built with precision planar geometry (Clipper WASM + flatten-js).

## Features

- **Precision geometry engine**: Uses Clipper (js-angusj-clipper) for robust planar geometry operations with integer-precision scaling
- **Analytical primitives**: flatten-js for centroids, point-along-path, perpendiculars, and arc geometry
- **Architectural rendering**: Proper wall junctions (offset→union→cut→stroke), door/window symbols, room labels with area calculations
- **Multi-theme output**: Blueprint (dark) and Whiteprint (light) themes with theme-aware text contrast
- **Multi-scale support**: Automatic scaling from paper millimeters to model units (1:100, 1:50, 1:200, etc.)
- **Multi-floor plans**: Render each floor separately or batch process buildings
- **Site and city plans**: Buildings, parcels, roads, green spaces, water features, barriers, trees, and paved areas

## Architecture

### Core Geometry Pipeline

1. **Input**: FloorPlanSpec or SiteSpec (Zod-validated schemas)
2. **Geometry Processing**:
   - Wall/road polylines are offset to solid bands (Clipper)
   - Overlapping bands are unioned (Clipper with NonZero fill rule)
   - Junctions are cleaned via offset→union→cut workflow
   - Interior polygons (rooms/parcels) are extracted
3. **Rendering**:
   - Walls/roads/outlines rendered as stroked paths (no fill)
   - Rooms/buildings rendered as filled polygons with hatch patterns
   - Openings (doors/windows) cut from walls or drawn as symbols
   - Text labels positioned at centroids with automatic contrast detection
   - Title blocks, scale bars, and north arrows added per AIA conventions
4. **Output**: SVG with embedded patterns, markers, and defs

### Key Files

- **src/geometry/clipper.ts**: Clipper WASM wrapper, offset, union, difference operations
- **src/geometry/primitives.ts**: flatten-js wrappers for centroids, perpendiculars, point-along-path, polygon area
- **src/geometry/scale.ts**: paper-mm ↔ model-unit conversion, dimension text formatting, scale-bar tick stops
- **src/render/theme.ts**: blueprint/whiteprint palettes, lineweight/linetype resolution, contrast-aware text color
- **src/render/titleblock.ts**: Title block generation with scaled text and backgrounds
- **src/render/symbols.ts**: Door swing, window glazing, grid bubbles, dimension strings, scale bars, north arrows
- **src/render/sheet.ts**: Sheet assembly — border, title block, north arrow, scale bar around the drawing content
- **src/tools/renderFloorPlan.ts**: Floor plan rendering pipeline
- **src/tools/renderSitePlan.ts**: Site plan rendering pipeline

## Getting Started

### Installation

```bash
npm install
npm run build
```

### Running Tests

```bash
npm test
```

Covers:
- Geometry operations (clipping, offsetting, unions)
- Schema validation
- Rendering pipeline
- Integration tests with real examples
- Regression tests for known bugs (junction seams, text sizing)

### Rendering Examples

All examples are in `examples/` directory. Each can be rendered via the CLI tools:

```typescript
import { handleRenderFloorPlan } from "./src/tools/renderFloorPlan.js";
import { initializeClipper } from "./src/geometry/clipper.js";

await initializeClipper();
const spec = JSON.parse(fs.readFileSync("examples/house.json", "utf-8"));
const result = await handleRenderFloorPlan({ spec });
console.log(result.content[0].text); // SVG output
```

## Example Specifications

### Floor Plan (house.json)

Single-floor residential plan:
- 15m × 10m footprint
- 2 rooms (living room, kitchen)
- Interior partition wall
- Exterior doors/windows
- Dimension annotations

```json
{
  "unit": "m",
  "scale": "1:50",
  "theme": "blueprint",
  "titleBlock": { /* ... */ },
  "floors": [
    {
      "id": "ground-floor",
      "level": 0,
      "outline": [[0, 0], [15, 0], [15, 10], [0, 10]],
      "walls": [ /* paths with thickness */ ],
      "rooms": [ /* polygons with labels */ ],
      "openings": [ /* doors and windows */ ],
      "dimensions": [ /* annotation lines */ ]
    }
  ]
}
```

### Multi-Floor (two-floor.json)

Two-story residential:
- Ground floor: Living Room, Kitchen, Bedroom, Bathroom
- First floor: Bedrooms, Bathroom, Landing
- Interior partitions on both levels
- 15m × 12m per floor

### Site Plan (site-plan.json)

Residential site with:
- Main building footprint
- Property parcel boundary
- Street frontage
- Driveway (asphalt)
- Sidewalk (concrete)
- Pool (water feature)
- Landscaping (lawn, garden)
- Property fence
- Site trees with species

```json
{
  "unit": "m",
  "scale": "1:100",
  "buildings": [ /* footprints with labels */ ],
  "roads": [ /* paths with width */ ],
  "pavedAreas": [ /* polygons with surface type */ ],
  "greenSpaces": [ /* polygons with landscape type */ ],
  "water": [ /* polygons with water type */ ],
  "barriers": [ /* paths with barrier type */ ],
  "trees": [ /* positions with radius and species */ ]
}
```

## CLI Tools

### renderFloorPlan

Renders architectural floor plans with proper junction handling and legend.

```typescript
export async function handleRenderFloorPlan(input: {
  spec: FloorPlanSpec;
  outputPath?: string;
}): Promise<ToolResult>;
```

**Input Schema** (FloorPlanSpec):
- `unit`: "m" | "ft" | "mm"
- `scale`: "1:50" | "1:100" | "1:200" (etc.)
- `theme`: "blueprint" | "whiteprint"
- `titleBlock`: Optional title block metadata
- `floors[]`: Array of floor specs, each with:
  - `outline`: Boundary polygon
  - `walls[]`: Wall polylines with thickness
  - `rooms[]`: Room polygons with type and optional custom fill
  - `openings[]`: Doors/windows with position and orientation
  - `dimensions[]`: Annotation lines with text

**Output**: SVG at `outputPath` or returned as text

### renderSitePlan

Renders site plans with buildings, roads, landscape, and utilities.

```typescript
export async function handleRenderSitePlan(input: {
  spec: SiteSpec;
  outputPath?: string;
}): Promise<ToolResult>;
```

**Input Schema** (SiteSpec):
- `buildings[]`: Building footprints with labels
- `roads[]`: Road polylines with width
- `pavedAreas[]`: Paved polygons (driveways, parking, sidewalks)
- `greenSpaces[]`: Landscape polygons (lawn, garden, trees)
- `water[]`: Water features (pools, ponds)
- `barriers[]`: Fences, walls, hedges
- `trees[]`: Individual tree positions with radius and species

## Scale and Units

All coordinates are in **model units** (meters, feet, mm depending on spec).

**Scale conversion** is automatic:
- Input scale string (e.g., "1:100") is parsed
- SVG font sizes and line widths are scaled appropriately
- At 1:100 with meters, 0.1 model units = 1cm on paper
- Text is rendered proportional to drawing size (0.5–3% of bbox height)

**Unit handling**:
- All internal calculations use model units
- Title blocks, scale bars adapt to unit and scale

## Theme System

### Blueprint (default)
- Background: Prussian blue (`#0B3D91`)
- Ink: Pale cyan (`#E0F2FF`)
- Poché fill: Darker blue (`#1A4BA8`)

### Whiteprint (opt-in)
- Background: White (`#FFFFFF`)
- Ink: Black (`#000000`)
- Poché fill: Light gray (`#D3D3D3`)

### Per-element fill and label contrast
Any drawable entity may set `style.fill` to highlight it in a specific color, regardless of theme. Room labels don't just use the theme's `ink` color unconditionally — `getContrastingTextColor` picks whichever of the theme's `ink` or `background` color has the greater luminance distance from the room's actual fill, so a label stays legible whether the room uses the theme default or a custom highlight color, in either theme.

## Technical Details

### Geometry Operations

**Offsetting Walls to Bands**:
```
Path (centerline) + thickness → Solid band polygon
```

**Junction Handling** (offset→union→cut→stroke), the core fix that makes connected walls/roads read as one drawing instead of overlapping outlines:
```
1. Offset every wall/road centerline in a floor/site to its own solid band (OpenButt end type)
2. Union all bands into one merged polygon (NonZero fill rule — EvenOdd would
   treat the genuinely-overlapping area at a junction as a hole and split
   the result back into separate pieces)
3. Difference the door/window opening cutters from that merged polygon
4. Stroke the single resulting boundary once — never per-wall
```

**Rooms are author-supplied, not derived.** A `Room.polygon` is authored directly in the spec to the room's interior wall face — it is not extracted or computed from the wall geometry. This keeps the computed area (`getPolygonArea`) honest as usable floor area, and means room fill always meets wall poché with no gap as long as the spec author places the room polygon at the wall's inner face. Label position is the room polygon's centroid (`getCentroid`).

### Text Rendering

All text sizing is computed as:
```
fontSize (model units) = textSizeInPaperMm * modelPerPaperMm(scale, unit)
modelPerPaperMm = scaleDenominator / mmPerUnit
```

For scale "1:100" with unit "m" (1 m = 1000 mm):
- modelPerPaperMm = 100 / 1000 = 0.1
- 1.5mm text → 1.5 * 0.1 = 0.15 model units (15 cm — reads correctly on a drawing sized in metres at 1:100)

This same conversion drives every line weight, tick size, and bubble radius — nothing is a hardcoded pixel/model-unit constant, so output reads correctly whether the spec is a metre-scale floor plan or a much larger site plan.

Text is rendered with `font-family="monospace"` for deterministic sizing.

### Patterns and Hatches

Hatches are defined as SVG `<pattern>` elements (`patternUnits="userSpaceOnUse"`, so density stays scale-correct and continuous across adjacent shapes) in `<defs>` and referenced via `fill="url(#hatch-type)"`:
- `hatch-brick`: 45° diagonal lines
- `hatch-masonry`: 45° diagonal lines, coarser than brick
- `hatch-concrete`: Stipple/dot pattern
- `hatch-insulation`: Batting pattern
- `hatch-lawn`: Scattered circles for grass
- `hatch-pavers`: Grid pattern for paved areas
- `hatch-earth`: Dense 45° lines for soil

## Known Limitations

- All polylines are treated as open paths; closed loops require explicit endpoint
- Text is positioned at geometric center; complex labels may benefit from manual adjustment
- Curved walls use straight line segments (no Bezier support yet)
- High-precision geometry relies on integer arithmetic; very large drawings may lose precision

## Contributing

All code follows TypeScript strict mode. Changes must:
1. Pass `npm run build` (TypeScript check)
2. Pass `npm test` (full test suite)
3. Update relevant tests if schemas or rendering change
4. For new examples, render and visually verify via headless Chrome

## Version History

v2 is a full rebuild of an earlier Turf.js-based prototype: a different geometry engine (Clipper + flatten-js, replacing Turf's geospatial/spherical math, which was the root cause of a geometry bug at wall/road junctions) and a renderer that follows real architectural drawing conventions (blueprint aesthetic, real units + named scale, line-weight hierarchy, poché/material hatching, dimensioning, structural grid, title block, north arrow, scale bar) rather than a generic vector diagram. See `docs/REASONS-CANVAS.md` for the full design history.
