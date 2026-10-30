# Assets: from DOS bytes to browser data

[Documentation home](../README.md) · [First-time setup](../../README.md#quick-start)

This chapter explains the data pipeline. You do not need to understand the binary formats to play: follow the root README first. The extractor reads original files; it does not download them or execute the game.

## How the original assets are stored and decoded

The original game does not store browser-ready images or JSON. Its graphics are indexed, planar binary resources; its object placement, collision geometry, animation descriptors and scripts are tables inside DOS load images. Decoding has three distinct steps:

```text
Original DOS files (SIMPSONS.EXE, LEVEL*.OVL, VGA.OVL)
  -> unpack_simpsons.py: PKLITE decompression -> *.image.bin
  -> export-viewer-assets.py: binary tables/graphics -> PNG + JSON + font
  -> npm run import-assets: copy the viewer output -> wwwroot/data
```

### 1. Remove executable compression

The supported executable and graphics overlays are MZ files packed with PKLITE 1.12. `tools/unpack_simpsons.py` implements the relevant PKLITE LZ/Huffman decompression, including the small/large and extra variants. It extracts the decompressed **load image**, without rebuilding a runnable MZ executable. Offsets in the next step refer to these flat images, not to the original compressed files. The unpacker also writes `unpack_manifest.json` with its extraction results.

### 2. Decode level graphics

`tools/simpsons_ovl_assets.py` reads the resource interface at offset `0x001C` in each unpacked `LEVELn.OVL.image.bin`. This short machine-code stub returns four resource locations in AX/BX/CX/DX: map, tiles, object sprites and Bart sprites. Locations are DOS paragraphs, so the byte offset is `paragraph * 16`. The decoder validates the instruction signature and resource sizes instead of assuming every level has Level 1's layout.

| Resource | Original storage | Decoding |
| --- | --- | --- |
| Background map | 11 rows per column; each tile ID is a **big-endian 16-bit word**, unlike most other DOS fields | Lookup is `column * 11 + row`. Place the referenced 16×16 tile at `(column * 16, row * 16)` to build `background_map.png`. |
| Background tiles | 16×16 pixels, 4 bits per pixel, **128 bytes per tile** | Each row contains eight bytes: `P0-left, P0-right, P1-left, P1-right, P2-left, P2-right, P3-left, P3-right`. Combine the corresponding bits into a palette index 0–15. |
| Object sprite sheet | 320×272 pixels; four separate 1-bit colour planes, followed by an equally sized zero-filled block | Each plane has 40 bytes per row. Combine plane bits into `P0 + 2*P1 + 4*P2 + 8*P3`. |
| Bart sprite sheet | 320×288 pixels; the same five-block storage arrangement | Decode the four colour planes in the same way. The fifth block is checked to be zero; it is **not** a stored transparency mask. |
| Sprite frames | 12-byte descriptors stored in `SIMPSONS.EXE`, referencing rectangles in the decoded sheets | Crop each rectangle into `object_frames/object_NNN.png` or `bart_frames/bart_NNN.png`. Sprite colour index 0 becomes transparent. |
| Palettes | Two per-level banks in the executable, each with a 16-byte adapter map and sixteen VGA RGB triples with 6-bit components | Convert DAC components to 8-bit RGB. Current exported gameplay PNGs use palette bank A; both banks and adapter mappings remain available in the manifest. |

The decoder can also export complete sheets, tile atlases, individual tiles and palette previews. The viewer exporter keeps the smaller set used by the application. It does not require those analysis images in `wwwroot/data`.

### 3. Decode gameplay tables, scripts, text and font

Graphics alone are insufficient: a sheet does not say where objects belong, how they move or which collision handler they use. `SIMPSONS.EXE.image.bin` contains the level metadata at segments `096D`, `0C8C`, `0F6B`, `1239` and `1556` for Levels 1–5. The corresponding flat-image base is `segment << 4`; a local table address becomes `base + offset`.

Each level starts with a `LevelRuntimeConfig` containing pointers to descriptor tables, object sources, scripts, collision profiles and static terrain. Most table fields are little-endian 16-bit values. The decoder follows these pointers and exports:

| Generated file, per level | Contents and original source |
| --- | --- |
| `manifest.json` | Resource boundaries, world dimensions, palettes and sprite descriptors, plus runtime/table summaries. Combines the level overlay layout with executable metadata. |
| `runtime_data.json` | Persistent object sources (10-byte records: streaming X, X, Y, type offset, flags), collision profiles (12-byte records: handler-table offset, X offset, width, Y offset, height, transition parameter), and static terrain (6-byte records: X start, X end, Y/flags). |
| `object_scripts.json` | Decoded object instructions, arguments, original addresses, control-flow edges, frame references, child types, sound references and native calls. DOS scripts are **direct-threaded**: instruction words identify handler addresses, followed by handler-specific arguments. The decoder uses recovered handler definitions to interpret these words. Unknown or dynamic native branches are reported as unresolved rather than invented. |
| `player_runtime.json` | Camera/player limits, starting position, default ground height, initial packed-BCD goals, and progress/inventory source pointers read from `LevelRuntimeConfig`. Also includes the modeled initial movement defaults: speed cap `0x0200` and animation reload `3`. |
| `event_messages.json` | Text and original message bytes read from the recovered executable message banks. Level 1 exports 19 messages starting at `096D:170B`; Level 5 exports five starting at `1556:1A20`. Messages end with zero; control bytes `01`/`02` plus their arguments describe line/position changes. Levels 2–4 currently export an empty `messages` list. This is the recovered message subset, not a claim that all game text has been catalogued. |

`tools/export-viewer-assets.py` calls the lower-level decoder and adds the player configuration, event messages and font needed by the viewer. It reads all **256 8×8 glyphs** from offset `0x4609` of `VGA.OVL.image.bin` into `dos_font_8x8.bin`: eight row bytes per glyph, 2,048 bytes total. The browser loads this file at startup; original font bytes are not embedded in the TypeScript source.

**All 25 level JSON files are generated from this pipeline**, alongside 1,427 PNGs and the font. They are not copied from an existing `wwwroot/data`, and no original game input is bundled with the extractor. The scripts contain recovered format definitions, addresses and limited runtime defaults. These addresses and message ranges target the supported DOS release, so this is not a universal decoder for other releases or ports.

Extraction makes the data available to the TypeScript runtime; it does not automatically implement every original engine/native function. In particular, common-overlay inventory/shop raster graphics, presentation screens remain outside this viewer export. PC-speaker and AdLib audio use the separate sound import. The documented shop-frame substitutes remain runtime approximations; Roland/MT-32 output is not implemented.


## 4. Sound is a separate pipeline

BUZZER.OVL and ADLIB.OVL are raw drivers rather than PKLITE-packed MZ resources. Use the original files with `npm run import-sound`; do not pass the unpacked directory. The generated sound JSON describes tones, instruments and command streams. See [audio](../audio/README.md).

## 5. Palette A, palette B and X-ray

The manifest preserves both banks as `runtime.palette_A` and `runtime.palette_B`. Each has `adapter_map` and `rgb6`; the lower-level exporter also records 8-bit diagnostic views. A VGA colour component is in 0..63, converted with `round(component * 255 / 63)`.

PNG pixels use bank A. When X-ray is active, [XrayPalette.ts](../../src/game/XrayPalette.ts) maps those colours to bank B after the game image is composed. In Level 1 that is the orange/brown view. It also affects sprites and the HUD, as a VGA palette change does. This is a palette lookup, not an arbitrary orange overlay. Index-zero sprite pixels remain transparent.

## 6. Runtime loading

[AssetRepository.ts](../../src/game/AssetRepository.ts) loads manifests, decoded scripts, collision/source data, player configuration and images. Descriptor indices identify frames; they are not object type IDs. Additional frames used only by X-ray, native actions or reserved projectiles must be preloaded even when the ordinary script traversal does not reference them.

The browser never decompresses the DOS EXE at startup. It consumes generated JSON and PNG files. A missing frame, a missing native implementation and a corrupt extraction are three different problems: inspect the manifest, VM trace and import error separately.

## 7. Reproduce and compare

Run from the repository root, after creating the Python environment described in the root README:

```powershell
.\.venv\Scripts\python.exe tools/export-viewer-assets.py "C:/assets/retro-mutant/UNPACKED" --export "C:/assets/retro-mutant/fresh-data"
.\.venv\Scripts\python.exe tools/verify-assets.py wwwroot/data "C:/assets/retro-mutant/fresh-data"
```

Use a fresh export destination. Verification compares file sets, JSON values, decoded image pixels and font bytes rather than assuming PNG compression is identical across Pillow versions. Audio is imported and tested separately.

If extraction fails a signature or size check, retain the error and identify the release; do not remove validation to force a different game version through fixed offsets.

## 8. Files that belong in Git

Commit source, tools and documentation. Keep original archives, EXE/OVL files, load images, decoded PNG/JSON/font files and oracle traces local. In particular, JSON extracted from the game is still game data. `wwwroot/data` and `obj` are ignored.

Run `node tools/check-repo-assets.mjs` after staging to check the repository asset boundary. Never use force-add to bypass that boundary.

## Code map

| File | Responsibility |
| --- | --- |
| [unpack_simpsons.py](../../tools/unpack_simpsons.py) | Supported PKLITE decompression |
| [simpsons_ovl_assets.py](../../tools/simpsons_ovl_assets.py) | Binary layouts, indexed graphics and script decoding |
| [export-viewer-assets.py](../../tools/export-viewer-assets.py) | Viewer subset, player tables, messages, reserved scripts and font |
| [import-decoded-assets.mjs](../../tools/import-decoded-assets.mjs) | Validate and copy the local viewer data |
| [verify-assets.py](../../tools/verify-assets.py) | Semantic comparison of two exports |

## 9. Sprite layers and overlap

Canvas has no automatic DOS depth ordering. `RenderOrder.ts` reconstructs the
pass order in VGA.OVL at 18EFh: calls to 1A2Bh, 1B50h, 1C85h, then Bart at
195Bh, then 1DBAh. Each object pass walks the physical slots in ascending order.
The flags in each runtime object choose its layer:

| flags & 2200h | Layer |
| --- | --- |
| 0000h | First object-bank pass |
| 0200h | Second object-bank pass |
| 2000h | Common/Bart-bank scenery behind Bart |
| — | Bart |
| 2200h | Common/Bart-bank scenery in front of Bart |

Flag 1000h suppresses the sprite in every object pass. The viewer can still show
a debug controller marker when that option is enabled. Picking uses reverse
sprite order, so the inspector selects foreground scenery before Bart.

For example, Level 1 source 0 (the bin at X=88) has flags A01Fh and belongs behind
Bart. Sources 17 and 44 (bins at X=1184 and X=2716) have A21Fh and belong in front.
Sorting by sprite Y or putting every bin in front would break this distinction.
These flags are already in the extracted JSON; no asset re-extraction is needed.

Confidence: HIGH for these VGA pass predicates and their call order, recovered
directly from the unpacked overlay. This does not claim a complete port of VGA
blitting, dirty rectangles, special background commands or transient rendering.
The browser still redraws the entire frame, and speech/debug overlays remain
viewer layers. `tools/smoke-render-order.mjs` checks every nonzero flag word,
actual bin records, compositor order and selection.
