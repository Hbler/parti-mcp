# REASONS Canvas — plan-mcp

> Structured Prompt-Driven Development canvas. See vault note `Coding/AI/Reasons-Canvas-SPDD.md` for the method. This canvas is the source of truth — if implementation and this document diverge, fix this document first, then regenerate/update code.

## R — Requirements

Build an MCP server, usable by **any** MCP-capable LLM client (primarily CLI coding agents like Claude Code, not a human typing coordinates by hand), that renders 2D plan-view drawings as SVG from a **structured JSON description**, not free text — at two distinct scales:

1. **City scale**: blocks, buildings (as footprints), roads, green spaces — the original capability.
2. **Building scale**: the interior floor plan of a single building — one or more floors, each with rooms, walls, and door/window openings. Covers both a simple single-floor house and a multi-floor building (each floor rendered as its own plan).

Definition of done:
- Server runs over stdio, discoverable as a standard MCP server (`mcp.json`-style config).
- Exposes two tools: `render_city_map` (input = validated `MapSpec`) and `render_floor_plan` (input = validated `FloorPlanSpec`, one or more floors). Both output SVG (returned as MCP content; optionally also written to a file path).
- All geometry (bounding boxes, scaling to viewBox, road/wall-to-polygon buffering, label placement) computed deterministically via a geometry library — neither tool does **any** LLM inference internally. The calling LLM produces the structured spec; the server only turns valid structured input into a correct SVG, deterministically.
- Worked example 1: a small city (a few blocks, a park, several buildings, roads) renders to a visually correct SVG, verified by opening it.
- Worked example 2: a small house floor plan (several rooms, walls, one door, one window) renders correctly.
- Worked example 3: a two-floor building renders as two separate, correct per-floor SVGs.

Out of scope for v1: isometric/3D rendering (for either city or floor plans), raster export (PNG), interactive/animated SVG, terrain/elevation, real-world geodata (GeoJSON/lat-lon) import, furniture/fixture placement, structural/code-compliance validation of floor plans, and combined cross-floor 3D or exploded views — each floor is a flat, independent 2D plan. v1 works in an abstract local coordinate space ("world units" for city maps, "building units" for floor plans).

## E — Entities

### City scale
- **MapSpec** (root): `bounds` (optional, auto-computed from contents if omitted), `units`, `background` style, `theme`, arrays of the entities below.
- **Block** (a parcel/lot boundary): `id`, `polygon` (footprint), optional `zone` (e.g. `residential`/`commercial`/`park`), `style`.
- **Building**: `id`, `footprint` (polygon), optional `floorCount`/`height` (drives fill shading intensity in v1, not 3D), `label`, `style`.
- **Road**: `id`, `path` (polyline/centerline), `width`, `type` (`arterial`/`local`/`pedestrian`) — rendered by buffering the centerline into a polygon of the given width.
- **GreenSpace**: `id`, `polygon`, `style` (parks, plazas).

Relationships: a City/MapSpec *contains* Blocks, Roads, GreenSpaces, Buildings, Labels as flat sibling arrays (not nested) — spatial containment (e.g. "this building is inside this block") is implicit from geometry, not from the data structure, in v1.

### Building scale (new)
- **FloorPlanSpec** (root): `buildingLabel` (optional), `units`, `theme`, `floors: Floor[]` — independent of `MapSpec`; a floor plan does not need city context (no roads/blocks) and uses its own local coordinate space per building.
- **Floor**: `id`, `level` (integer, e.g. `0` = ground, `1`, `2`, ... — also used for output ordering/naming), `outline` (polygon, the floor's overall footprint — may differ per floor for setbacks/terraces), `label`, arrays of `rooms`, `walls`, `openings`.
- **Room**: `id`, `polygon`, `roomType` (`bedroom`/`kitchen`/`bathroom`/`living`/`hallway`/`other`), `label`, `style`. Structurally the same shape as **Block** (polygon + style) — the render/geometry code is shared, not duplicated (see Approach).
- **Wall**: `id`, `path` (polyline/centerline), `thickness`, `style` — rendered by buffering the centerline into a polygon, exactly like **Road**, just at building scale with a `thickness` instead of `width`.
- **Opening**: `id`, `wallId` (which wall it interrupts), `positionAlongWall` (0–1 fraction along the wall's centerline), `width`, `type` (`door`/`window`) — rendered as a gap cut into the wall polygon plus a type-specific SVG marker (door: quarter-circle swing arc; window: a short double-line across the gap). This is the one genuinely new render primitive the floor-plan capability introduces.

- **Label** (shared): `text`, `position` (or `anchorEntityId` to auto-place at an entity's centroid), `size` — used at both scales.
- **Style** (shared): `fill`, `stroke`, `strokeWidth`, `opacity` — attachable to any entity at either scale, with type-level defaults so a spec can omit styling entirely.

## A — Approach

- **Input validation**: Zod schemas are the single source of truth for both `MapSpec` and `FloorPlanSpec` (`z.infer`), enforced at each tool's boundary. No unvalidated data reaches geometry/render code.
- **Geometry**: Turf.js handles bbox of the full spec and `turf.centroid` for auto-placed labels. The SVG `viewBox` is emitted in **world coordinates** — the padded bounding box of all content as `minX minY width height` — rather than rescaling every coordinate into a fixed pixel canvas; the root `<svg>`'s `width`/`height` (100%) let the viewer scale it to fit. This keeps geometry in a single coordinate space end-to-end (so buffered widths, marker sizes, stroke widths and label positions stay mutually proportional) and guarantees content whose origin is non-zero or whose coordinates go negative is still fully in-frame (a fixed `0 0 W H` viewBox would crop it or cram it into a corner). Centerline buffering (roads *or* walls, into polygons) is **not** done via `turf.buffer` — that function is geodesic (always treats coordinates as lon/lat on a sphere, regardless of the `units` option passed) and produced wildly distorted output against this project's planar/local coordinates. `geometry.ts` implements a planar perpendicular-offset buffer instead (`width`/`thickness` is the total buffer width, offset by half on each side of the centerline). Openings are cut with a **planar boolean difference** (`turf.difference`, which operates in Cartesian coordinates, unlike `turf.buffer`): a rectangular cutter `opening.width` wide, centered at `positionAlongWall` and deeper than the wall, is subtracted from the buffered wall polygon — a real gap that may split one wall into two polygons, all of which are rendered.
- **Shared abstraction (why two scales don't mean two pipelines)**: Room/Block and Wall/Road are structurally identical pairs — "polygon + style" and "buffered centerline + style" respectively. `geometry.ts` and `render/svg.ts` are written against those two generic shapes (`PolygonEntity`, `LinearEntity`) rather than against `Block`/`Road` by name, so city and floor-plan rendering share one geometry/render core. Only the entity-specific parts are genuinely separate: zone-vs-roomType coloring, and the wall **Opening** primitive (city scale has no equivalent).
- **Rendering**: hand-built SVG via template/string-building functions. City scale composes background → green spaces → blocks → roads → buildings → labels. Floor-plan scale composes background → floor outline → rooms → walls (with openings cut in) → labels. No headless browser, no canvas library — output is a plain SVG string in both cases.
- **Multi-floor buildings**: each `Floor` renders to its own independent SVG (selected/named by `level`), not stacked or combined into a single image — `render_floor_plan` returns one SVG per floor in the response when a spec has multiple floors. No cross-floor 3D or exploded view in v1.
- **Coordinate space**: v1 works in abstract local coordinate systems (caller-defined "world units" for city maps, "building units" for floor plans), not geographic lat/lon — geodata import is explicitly deferred. The axis convention is **SVG-native**: origin at top-left, x increasing right, y increasing **down**. Specs are authored directly in this convention and there is no y-flip between spec coordinates and rendered output — the world-space `viewBox` maps input coordinates 1:1 to SVG user space, so a spec author reasons in the same coordinate space the SVG uses.
- **Isometric/3D**: deferred at both scales; `height`/`floorCount` in v1 only affects 2D shading (darker fill = taller), not projection.

## S — Structure

New standalone repo: `~/Coding/plan-mcp` (TypeScript/Node, own git repo — not inside the Obsidian vault, per iCloud-sync-conflict concerns noted in the vault's CLAUDE.md).

```
plan-mcp/
├── src/
│   ├── index.ts             # MCP server entrypoint, stdio transport, tool registration
│   ├── schema.ts            # Zod schemas: MapSpec + city entities, FloorPlanSpec + floor entities, shared Label/Style
│   ├── geometry.ts          # Turf.js helpers, written against generic PolygonEntity/LinearEntity shapes:
│   │                        # bbox, scaling to viewBox, centerline buffering, centroid labels — shared by both scales
│   ├── render/
│   │   ├── svg.ts           # Generic PolygonEntity/LinearEntity → SVG element functions + composer, shared by both scales
│   │   └── openings.ts      # Floor-plan-only: cuts a gap in a buffered wall polygon, draws door/window markers
│   └── tools/
│       ├── renderCityMap.ts    # render_city_map tool: validate → geometry → render → MCP content (+ optional file write)
│       └── renderFloorPlan.ts  # render_floor_plan tool: validate → per-floor geometry/render → one SVG per floor
├── examples/
│   ├── small-city.json      # Worked example MapSpec (3 blocks, park, 5 buildings, roads)
│   ├── small-house.json     # Worked example FloorPlanSpec, single floor (rooms, walls, 1 door, 1 window)
│   └── two-floor-building.json  # Worked example FloorPlanSpec, two floors
├── test/
│   ├── schema.test.ts
│   ├── geometry.test.ts
│   ├── renderCityMap.test.ts
│   └── renderFloorPlan.test.ts
├── docs/
│   └── REASONS-CANVAS.md    # this file
├── package.json
├── tsconfig.json
└── README.md                 # includes MCP client config snippet
```

Dependencies: `@modelcontextprotocol/sdk`, `zod`, `@turf/turf`. Dev: `typescript`, `vitest` (or `node:test`), `tsx`.

Note: `render_map`/`renderMap.ts` from the original draft is renamed `render_city_map`/`renderCityMap.ts` here, to sit clearly alongside `render_floor_plan` — if implementation already started under the old name, rename in the same step rather than keeping both.

## O — Operations

**Execution loop, applied to each numbered step below**: write the tests for that step first (from its stated assertions) → confirm they fail (red) → implement the minimum to pass → run the full test suite → if anything fails, fix and re-run → do not advance to the next step until the entire suite (not just the new tests) is green. This makes each step a checkpoint the agent can self-verify against, rather than a description to eyeball.

1. Scaffold: `package.json`, `tsconfig.json` (strict mode), MCP SDK server skeleton over stdio, a trivial ping/health tool to confirm the client can connect. Test: a harness that spawns the server over stdio and asserts the ping tool responds.
2. `schema.ts` (city scale): Zod schemas for `MapSpec` and its entities. Tests first, in `test/schema.test.ts`: a minimal valid spec parses; each required-field omission is rejected; each out-of-bounds/wrong-type coordinate is rejected (ties to Safeguards' numeric-bounds rule). Then implement the schemas until green.
3. `geometry.ts` + `render/svg.ts`, built against generic `PolygonEntity`/`LinearEntity` shapes (not against `Block`/`Road` by name) so the floor-plan capability can reuse them without rewriting: bbox, world-space viewBox (padded world bbox `minX minY width height`, no per-coordinate rescale), centerline buffering, centroid labels; one render function per generic shape plus a composer. Tests first, in `test/geometry.test.ts` and directly against the generic functions, with known-coordinate fixtures asserting exact output. Then implement.
4. `tools/renderCityMap.ts`: wire validate → geometry → render into `render_city_map`; return SVG as text content; if `outputPath` provided, write file inside the allowed output directory only. Tests first, in `test/renderCityMap.test.ts`: valid spec → well-formed SVG; invalid spec → MCP tool error (not a thrown exception); `outputPath` escaping the allowed directory (e.g. via `..`) → rejected. Then implement.
5. `examples/small-city.json` + integration test: parse the example, run the full pipeline, assert well-formed XML with expected element counts (N blocks, N buildings, N roads, N labels). Write this test against the example file before wiring the pipeline, so it's the first end-to-end green.
6. `schema.ts` (building scale): Zod schemas for `FloorPlanSpec`, `Floor`, `Room`, `Wall`, `Opening`. Tests first, in `test/schema.test.ts`: minimal valid single-floor spec parses; multi-floor spec parses; each required-field omission rejected; an `Opening` referencing a nonexistent `wallId` is rejected; `positionAlongWall` outside `[0,1]` is rejected. Then implement.
7. `render/openings.ts`: the one new render primitive — cutting a gap into a buffered wall polygon at `positionAlongWall` ± half the opening `width`, plus door-swing-arc / window-double-line markers. Tests first, in a dedicated test file, with known wall + opening fixtures asserting the exact resulting geometry/SVG fragment. Then implement.
8. `tools/renderFloorPlan.ts`: wire validate → per-floor geometry (reusing the generic functions from step 3 for rooms-as-`PolygonEntity` and walls-as-`LinearEntity`, plus `render/openings.ts`) → one SVG per `Floor`, keyed by `level`. Tests first, in `test/renderFloorPlan.test.ts`: single-floor spec → one well-formed SVG; multi-floor spec → correct number of SVGs, each internally consistent; invalid spec → MCP tool error. Then implement.
9. `examples/small-house.json` + integration test: single floor, several rooms, one door, one window — assert well-formed XML, expected room/wall/opening counts, and that the door/window markers are present in output.
10. `examples/two-floor-building.json` + integration test: assert two distinct, correct SVGs are returned, one per floor.
11. `README.md`: MCP client config snippet (stdio command) for Claude Code / other CLI agents; document both `MapSpec` and `FloorPlanSpec` shapes with examples inline. No test — documentation step.
12. Manual smoke test: register the server with an MCP client, call `render_city_map` and `render_floor_plan` with their example specs, open the resulting SVGs and visually confirm each looks correct (city: streets don't overlap buildings, park is green, labels legible; floor plan: rooms don't overlap, door/window gaps land on the right walls, multi-floor produces genuinely separate plans). This is the one step the automated loop can't cover — do it once the full suite is green.

## N — Norms

- Test-first: for every Operations step, tests are written and confirmed failing before implementation, and the full suite must be green before moving to the next step (see the execution loop under Operations).
- TypeScript `strict: true`, no `any`.
- Zod schemas are the single source of truth for types — application types are `z.infer<typeof Schema>`, never hand-duplicated interfaces.
- Geometry and render functions are pure (input → output, no I/O, no mutation of inputs).
- Tool-layer errors (validation failures, geometry errors) are returned as MCP tool errors with a descriptive message — never an uncaught exception/stack trace back to the client.
- No network calls anywhere in the server.
- Deterministic: identical `MapSpec` input always produces byte-identical SVG output.

## S — Safeguards

- All numeric fields (coordinates, widths, heights, thicknesses) validated as finite numbers within sane bounds (schema-level `min`/`max`) — reject NaN/Infinity/absurd magnitudes before they reach geometry code.
- Per-request entity count caps to bound render cost and output size, defaulted conservatively: e.g. max 500 buildings / 200 roads at city scale; max 100 floors per building, 100 rooms and 200 walls/openings per floor at building scale.
- `Opening.wallId` must reference a `Wall` that exists in the same `Floor`, and `positionAlongWall` must be within `[0, 1]` — reject specs that don't satisfy this before any geometry is computed (an opening on a nonexistent or out-of-range wall position is a malformed spec, not a renderable edge case).
- Any user-supplied text (`label.text`, `Room.label`, `Floor.label`, etc.) is XML-escaped before embedding in the SVG — no raw string interpolation into markup.
- File writes only permitted inside a server-configured allowed output directory (resolved and checked with `path.resolve` + prefix check); `outputPath` may never escape it, and the tool must reject attempts that do (e.g. via `..`).
- Reject specs whose padded world-space extent (the `width`/`height` of the computed viewBox) exceeds a sane maximum in either dimension (prevents pathological/huge SVG generation from a bad or adversarial spec).

---

**Status: implemented.** All 12 Operations steps complete, 112/112 tests passing, git repo initialized at `~/Coding/plan-mcp`. Smoke-test SVGs in `smoke-output/` (gitignored, generated by `scripts/smoke-test.mjs`) — open in a browser to visually confirm the three worked examples.
