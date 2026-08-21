# plan-mcp

An MCP server for rendering 2D plan-view drawings as SVG. Supports both city-scale maps (blocks, buildings, roads, greenspaces) and building-scale floor plans (rooms, walls, openings).

## Quick Start

### Installation

```bash
npm install
```

### Building

```bash
npm run build
```

### Running Tests

```bash
npm test
```

### Starting the Server

```bash
npm start
```

## MCP Client Configuration

To connect an MCP client to this server, configure it with stdio transport:

**JSON Configuration (e.g., in Claude settings):**

```json
{
  "mcpServers": {
    "plan-mcp": {
      "command": "node",
      "args": ["/path/to/plan-mcp/dist/index.js"]
    }
  }
}
```

**Alternative (using tsx for development):**

```json
{
  "mcpServers": {
    "plan-mcp": {
      "command": "tsx",
      "args": ["/path/to/plan-mcp/src/index.ts"]
    }
  }
}
```

The server exposes two main tools via the MCP protocol: `render_city_map` and `render_floor_plan`.

## API Overview

### Tool 1: render_city_map

Renders city-scale maps showing blocks, buildings, roads, and greenspaces.

**Inputs:**
- `spec` (required): MapSpec object or JSON string defining the city layout
- `outputPath` (optional): File path to save SVG output (relative to `output/` directory)

**Output:**
- SVG text (if no outputPath specified)
- Confirmation message with file path (if outputPath provided)

**Example Input (MapSpec):**

```json
{
  "units": "meters",
  "background": "#f5f5f5",
  "theme": "urban",
  "blocks": [
    {
      "id": "blk1",
      "zone": "residential",
      "polygon": [[[0, 0], [200, 0], [200, 200], [0, 200]]]
    }
  ],
  "buildings": [
    {
      "id": "bld1",
      "footprint": [[[20, 20], [80, 20], [80, 80], [20, 80]]],
      "floorCount": 3,
      "label": { "text": "Tower A" }
    }
  ],
  "roads": [
    {
      "id": "rd1",
      "path": [[0, 250], [500, 250]],
      "width": 15,
      "type": "primary"
    }
  ],
  "greenspaces": [
    {
      "id": "park1",
      "polygon": [[[250, 0], [450, 0], [450, 200], [250, 200]]]
    }
  ]
}
```

**Example Output:**

```
SVG document rendered to output/city_map.svg (450px × 400px)
```

### Tool 2: render_floor_plan

Renders building-scale floor plans for single or multiple floors.

**Inputs:**
- `spec` (required): FloorPlanSpec object or JSON string defining floor layout
- `outputPath` (optional): File path to save SVG output (relative to `output/` directory)

**Output:**
- Single SVG text (for single floor)
- Array of SVGs (for multi-floor buildings)
- File path confirmation (if outputPath provided)

**Example Input (FloorPlanSpec):**

```json
{
  "units": "meters",
  "theme": "residential",
  "floors": [
    {
      "level": 0,
      "outline": [[[0, 0], [300, 0], [300, 200], [0, 200]]],
      "rooms": [
        {
          "id": "living",
          "roomType": "living_room",
          "polygon": [[[10, 10], [150, 10], [150, 100], [10, 100]]],
          "label": { "text": "Living Room" }
        },
        {
          "id": "bed1",
          "roomType": "bedroom",
          "polygon": [[[160, 10], [290, 10], [290, 100], [160, 100]]],
          "label": { "text": "Bedroom 1" }
        }
      ],
      "walls": [
        {
          "id": "wall1",
          "path": [[155, 10], [155, 100]],
          "thickness": 0.3
        }
      ],
      "openings": [
        {
          "id": "door1",
          "wallId": "wall1",
          "position": 0.5,
          "width": 1.0,
          "type": "door"
        }
      ]
    }
  ]
}
```

**Example Output:**

```
SVG document rendered to output/floor_plan_L0.svg (300px × 200px)
```

## Entity Reference

### City Scale (MapSpec)

The MapSpec root object defines a complete city layout with the following structure:

```typescript
{
  units?: string;           // "meters", "feet", etc.
  background?: string;      // Background color (hex or named)
  theme?: string;           // Visual theme: "urban", "suburban", "rural"
  blocks?: Block[];          // Neighborhood units
  buildings?: Building[];    // Structures
  roads?: Road[];            // Transportation network
  greenspaces?: GreenSpace[];// Parks and vegetation
}
```

**Entity Types:**

#### Block
Neighborhood or zoning unit.
```typescript
{
  id: string;               // Unique identifier
  polygon: [number, number][][]; // Outer ring + holes
  zone?: string;            // Zone type: "residential", "commercial", etc.
  style?: Style;            // Fill, stroke, opacity
}
```

#### Building
Structure within a block.
```typescript
{
  id: string;               // Unique identifier
  footprint: [number, number][][]; // Outer ring + holes
  floorCount?: number;      // Number of floors (1+)
  height?: number;          // Building height in units
  label?: Label;            // Text label with optional position
  style?: Style;            // Fill, stroke, opacity
}
```

#### Road
Transportation network element.
```typescript
{
  id: string;               // Unique identifier
  path: [number, number][]; // Centerline (2+ points)
  width: number;            // Road width in units
  type?: string;            // "primary", "secondary", "local", etc.
  style?: Style;            // Fill, stroke, opacity
}
```

#### GreenSpace
Park or vegetation area.
```typescript
{
  id: string;               // Unique identifier
  polygon: [number, number][][]; // Outer ring + holes
  style?: Style;            // Fill, stroke, opacity
}
```

### Building Scale (FloorPlanSpec)

The FloorPlanSpec root object defines one or more building floors with the following structure:

```typescript
{
  units?: string;           // "meters", "feet", etc.
  theme?: string;           // Visual theme: "residential", "commercial", "industrial"
  floors: Floor[];          // Array of floor levels
}
```

**Entity Types:**

#### Floor
A single building level.
```typescript
{
  level: number;            // Floor number (0 = ground floor)
  outline: [number, number][][]; // Outer ring + holes
  rooms?: Room[];           // Interior spaces
  walls?: Wall[];           // Interior dividers
  openings?: Opening[];     // Doors and windows
  style?: Style;            // Floor background style
}
```

#### Room
Interior space within a floor.
```typescript
{
  id: string;               // Unique identifier
  roomType?: string;        // "bedroom", "kitchen", "bathroom", etc.
  polygon: [number, number][][]; // Outer ring + holes
  label?: Label;            // Room name
  style?: Style;            // Fill, stroke, opacity
}
```

#### Wall
Interior dividing wall.
```typescript
{
  id: string;               // Unique identifier
  path: [number, number][]; // Centerline (2+ points)
  thickness: number;        // Wall thickness in units
  style?: Style;            // Stroke color/width
}
```

#### Opening
Door or window in a wall.
```typescript
{
  id: string;               // Unique identifier
  wallId: string;           // Reference to parent wall
  position: number;         // Distance along wall (0.0 - 1.0)
  width: number;            // Opening width in units
  type?: string;            // "door", "window", "opening"
  style?: Style;            // Stroke color for outline
}
```

### Common Schemas

#### Style
Visual appearance.
```typescript
{
  fill?: string;            // Fill color (hex or named)
  stroke?: string;          // Stroke color
  strokeWidth?: number;     // Stroke width in pixels (0-100)
  opacity?: number;         // Opacity (0-100 as percentage)
}
```

#### Label
Text annotation.
```typescript
{
  text: string;             // Label text (1-500 chars)
  position?: [number, number] | [number, number, number]; // Custom position or offset
  anchorEntityId?: string;  // Entity ID to anchor to
  size?: number;            // Font size in pixels (1-500)
}
```

## Examples

Three example files are provided in the `examples/` directory:

### small-city.json
A city-scale map with:
- 3 neighborhood blocks (residential and commercial)
- 1 central park
- 5 buildings (ranging from 1-3 floors)
- 3 roads (primary and local streets)

Run with `render_city_map` tool.

### small-house.json
A single-floor residential floor plan with:
- 5 rooms (living room, kitchen, 2 bedrooms, 1 bathroom)
- 8 walls dividing the spaces
- 8 openings (doors and windows)

Run with `render_floor_plan` tool.

### two-floor-building.json
A two-floor commercial building with:
- 8 total rooms (4 per floor)
- 15 walls across both floors
- 12 openings (doors for offices and circulation, windows on perimeter)

Run with `render_floor_plan` tool.

### How to Run Examples

1. Load the JSON from `examples/`:
   ```bash
   cat examples/small-city.json
   ```

2. Pass to the appropriate tool:
   - City maps: `render_city_map` with spec + outputPath
   - Floor plans: `render_floor_plan` with spec + outputPath

3. Output SVGs are written to the `output/` directory.

## Output

SVG files are rendered to the `output/` directory by default. Each SVG is a standard 2D vector graphic viewable in:
- Web browsers (any modern browser)
- Graphic editing tools (Inkscape, Adobe Illustrator, etc.)
- Image viewers

### Multi-Floor Buildings

Floor plans with multiple floors generate one SVG per floor. Filenames follow the pattern:
```
{outputPath}_L{level}.svg
```

For example, `two-floor-building.json` with `outputPath: "office"` produces:
- `output/office_L0.svg` (ground floor)
- `output/office_L1.svg` (first floor)

## Technology Stack

- **TypeScript**: Strongly typed implementation
- **Zod**: Input validation and schema inference
- **Turf.js**: Geometry calculations (polygon operations, centroid, area)
- **MCP SDK**: Model Context Protocol integration
- **Vitest**: Test framework with 112 passing tests

## Security Notes

- **File write restrictions**: Output files are restricted to the `output/` directory. Path traversal attempts containing `..` are rejected.
- **SVG escaping**: All user-supplied text is XML-escaped in SVG output to prevent injection attacks.
- **Input validation**: All specs are validated against Zod schemas before rendering.

## Development

### Project Structure

```
src/
  ├── index.ts              # MCP server entry point
  ├── schema.ts             # Zod schemas for MapSpec and FloorPlanSpec
  ├── geometry.ts           # Geometry utilities (centroid, area, intersections)
  ├── render/               # Rendering modules
  │   ├── renderCityMap.ts
  │   └── renderFloorPlan.ts
  └── tools/                # Tool handlers
      ├── renderCityMap.ts
      └── renderFloorPlan.ts

test/                        # Test suite (112 tests)
examples/                    # Example specs
output/                      # Rendered SVG output
```

### Building

```bash
npm run build
```

Compiles TypeScript to `dist/` for production use.

### Testing

```bash
npm test
```

Runs the full test suite (112 tests across 7 test files):
- `scaffold.test.ts` — Server setup and tool registration
- `schema.test.ts` — Input validation
- `geometry.test.ts` — Geometry calculations
- `render.test.ts` — SVG rendering primitives
- `renderCityMap.test.ts` — City map rendering
- `openings.test.ts` — Door/window placement
- `renderFloorPlan.test.ts` — Floor plan rendering

### Future Improvements

- Isometric or 3D perspective rendering
- Raster export (PNG, JPEG)
- Furniture placement and layout
- Terrain and elevation visualization
- Pathfinding and routing display
