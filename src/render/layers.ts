/**
 * render/layers.ts — NCS-inspired layer ids and draw order
 * Layer order is the single source of draw order (painter's algorithm)
 */

// Layer IDs for organization
export const LayerIds = {
  // Site layers
  PROPERTY: "V-PROP",
  ROADS: "C-ROAD",
  HARDSCAPE: "L-HARD",
  WATER: "L-WATR",
  LANDSCAPE: "L-PLNT",
  BARRIERS: "L-SITE",
  BUILDINGS: "A-BLDG",

  // Floor plan layers
  FLOOR_SLAB: "A-FLOR",
  WALLS: "A-WALL",
  GLAZING: "A-GLAZ",
  DOORS: "A-DOOR",

  // Annotation layers
  DIMS: "A-ANNO-DIMS",
  TEXT: "A-ANNO-TEXT",
  GRID: "S-GRID",
};

/**
 * Get a layer id from a role name
 */
export function getLayerId(role: string): string {
  const map: Record<string, string> = {
    floor: LayerIds.FLOOR_SLAB,
    walls: LayerIds.WALLS,
    glazing: LayerIds.GLAZING,
    doors: LayerIds.DOORS,
    property: LayerIds.PROPERTY,
    roads: LayerIds.ROADS,
    hardscape: LayerIds.HARDSCAPE,
    water: LayerIds.WATER,
    landscape: LayerIds.LANDSCAPE,
    barriers: LayerIds.BARRIERS,
    buildings: LayerIds.BUILDINGS,
    dimensions: LayerIds.DIMS,
    text: LayerIds.TEXT,
    grid: LayerIds.GRID,
  };

  return map[role] || LayerIds.TEXT;
}

/**
 * Fixed draw order (painter's algorithm)
 * Earlier layers render first (appear behind); later layers render on top
 */
export function getLayerOrder(): string[] {
  return [
    LayerIds.FLOOR_SLAB,
    LayerIds.PROPERTY,
    LayerIds.ROADS,
    LayerIds.HARDSCAPE,
    LayerIds.WATER,
    LayerIds.LANDSCAPE,
    LayerIds.BARRIERS,
    LayerIds.BUILDINGS,
    LayerIds.WALLS,
    LayerIds.GLAZING,
    LayerIds.DOORS,
    LayerIds.DIMS,
    LayerIds.TEXT,
    LayerIds.GRID,
  ];
}

/**
 * Create an SVG group for a layer
 */
export function createLayerGroup(layerId: string, content: string): string {
  return `<g id="${layerId}">\n${content}\n</g>`;
}
