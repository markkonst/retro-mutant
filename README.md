# Simpsons DOS Script VM Viewer — Visual Studio / TypeScript

A modern TypeScript/browser rewrite and reverse-engineering viewer for **The Simpsons: Bart vs. the Space Mutants (DOS)**. This is a standalone Visual Studio project, separate from the earlier static viewer.

## Local assets: required before running

This repository ships the TypeScript implementation and extraction tools. Supply your own original **DOS** game files; sprites, backgrounds, game text, runtime data and the VGA font are generated locally and excluded from Git. The extractor targets the DOS release supported by the recovered offsets; Amiga/console releases are incompatible.

Requirements: Node.js/npm, Python **3.10 or newer**, and Pillow. Run the following from the repository root (PowerShell examples; replace the paths with your own):

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install Pillow
npm install

# 1. Unpack PKLITE from the original DOS executable/overlays.
.\.venv\Scripts\python.exe tools/unpack_simpsons.py --input "C:/games/SIMPSONS" --output "C:/assets/retro-mutant/UNPACKED"

# 2. Decode a fresh output directory with the complete viewer data.
.\.venv\Scripts\python.exe tools/export-viewer-assets.py "C:/assets/retro-mutant/UNPACKED" --export "C:/assets/retro-mutant/data"

# 3. Copy the generated assets into this checkout's wwwroot/data.
npm run import-assets -- "C:/assets/retro-mutant/data"

# 4. Start the viewer.
npm run dev
```

Open `http://localhost:5173`. If your original files are in an archive, first extract that archive into `C:/games/SIMPSONS`. That folder must contain `SIMPSONS.EXE`, `LEVEL1.OVL` through `LEVEL5.OVL`, and `VGA.OVL` (keeping the other original overlays there is fine). The first Python step then decompresses the packed MZ files into **flat DOS load images** such as `SIMPSONS.EXE.image.bin`; these are data for the decoder, not runnable executables. No external unpacker or Ghidra is required. The reported skips for `ADLIB.OVL`, `BUZZER.OVL` and `ROLAND.OVL` are expected: they are not packed MZ executables. Use `--force` on the unpacker to overwrite an earlier unpacking; use a fresh output folder for the viewer exporter.

You must place the generated output in **`wwwroot/data`**: copy the contents of the output `data` folder, not that folder inside another `data` folder. `npm run import-assets` does this for you and replaces the five local level folders after checking all inputs. Expected layout:

```text
wwwroot/data/
  dos_font_8x8.bin
  level1/                    # likewise level2 through level5
    background_map.png
    manifest.json
    runtime_data.json
    object_scripts.json
    player_runtime.json
    event_messages.json
    object_frames/object_*.png
    bart_frames/bart_*.png
```

The five levels contain 1,427 PNGs and 25 JSON files; the 2,048-byte font is also extracted from `VGA.OVL`. `tools/simpsons_ovl_assets.py` is the lower-level decoder: its `--export` additionally produces tile atlases, individual tiles, palettes and full sprite sheets for analysis, but does not generate all viewer-specific JSON or the font. Use `export-viewer-assets.py` for running this project. Startup, title/common-overlay graphics and sound-driver files exist in the original game but are not additional files required by this viewer; sound is currently modeled as logical events.

`wwwroot/data` must remain on disk to play, but the **entire folder is ignored by Git**, including the decoded JSON. Git does not preserve empty folders, so a fresh clone gets it when you import assets. Original overlays, unpacked images, archives and the Python environment are also ignored. Do not force-add game data with `git add -f`.

Before committing, run `node tools/check-repo-assets.mjs` after staging. GitHub Actions runs the same check on pushes and pull requests. Ignore rules protect normal Git adds; force-adding can bypass them, and CI detects that only after upload, so never force-add assets.

To compare a fresh extraction with existing local data:

```powershell
.\.venv\Scripts\python.exe tools/verify-assets.py wwwroot/data "C:/assets/retro-mutant/data"
npm run smoke
```

Verification compares the complete file set, JSON values, decoded RGBA pixels and font bytes. Different Pillow/zlib versions may encode identical pixels into different PNG bytes; JSON whitespace may also differ.

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

Extraction makes the data available to the TypeScript runtime; it does not automatically implement every original engine/native function. In particular, common-overlay inventory/shop raster graphics, presentation screens and audio decoding remain outside this viewer export. The documented shop-frame substitutes and logical sound events are still runtime approximations.

## Current milestone — v0.9.6

The project now connects the recovered object ScriptVM, Bart movement, collision engine, damage state, DOS-style HUD and the recovered 14-slot inventory/action state:

```text
LevelObjectSource + object scripts          LevelRuntimeConfig + keyboard
                 ↓                                      ↓
          GameObjectRuntime                           BartPlayer
                 ↓                                      ↓
          ScriptVm + motion                    movement / jump / anim
                 └──────────────┬───────────────────────┘
                                ↓
                         CollisionSystem
                     terrain + object profiles
                                ↓
                    damage / score / goals / lives
                                ↓
                        RuntimeWorld HUD state
                                ↓
                           WorldViewer
```

### Typed level-specific handlers

v0.9 adds a typed handler registry under `src/game/levels/`. `RuntimeWorld` owns one active level handler set; loading a new level disposes/unloads the previous set before the new one is initialized. Engine call sites stay generic and expose typed hooks for per-frame player logic, inventory use, VM FAR natives, child spawns and level-specific HUD presentation. All currently modeled Level-1-only TypeScript behavior lives under `src/game/levels/level1/`; Levels 2-5 currently use `EmptyLevelHandlers` until their recovered branches are migrated. See [`docs/LEVEL_HANDLERS.md`](docs/LEVEL_HANDLERS.md).


### Level-1 player paths (v0.9.6)

`Level1PlayerHandlers.ts` owns both recovered Level-1 player branches. The skateboard interval `0x0D6C <= BartX < 0x2180` models the `DS:084C/084D` direction latches, `084E` push impulse, `0850` animation state, `0852` mode gate, low-byte `082C` fixed-point accumulator, `±0x0800` speed clamp, skateboard camera band and the `0x40` / spray-can `0x5A` descriptor families. Source #53/#83 type-61 boundaries are disabled on entry and restored on exit.

The storefront branch is now modeled through `Level1ShopHandlers.ts`: `Q/Up` at one of the three recovered storefront X cells starts the `DS:07F1/07F2` state machine (`02..10`), `O/P` selects, `Space` buys using packed-BCD coins/inventory counts plus binary shop stock, and `A/Down` exits. The storefront still uses the recovered `30xx` common-overlay pointers and four DOS transient slots. For the open/closed primary door poses, v0.9.6 maps those pointers to matching decoded Level-1 door-frame surrogates; the DOS-font popup remains for shop selection/stock information.


### Level-1 v0.9.6 visual/progression fixes

Level-1 background goals that are controlled through `ExternalSpecial3Bytes` are no longer invisible state changes in the browser. The baseline `04 04 0D` state leaves the decoded purple background art untouched; the altered `04 0A 06` state applies the local red palette remap used by the T38→T39 poster and T73→T74 awning transitions. T73 now waits on the real handler-20 external countdown sourced from the WRENCH action.

X-RAY SPECS now affect rendering as DOS does: objects carrying flag `0400h` use the descriptor at `+48h` (six 12-byte descriptors) while `07DE` is active. The Level-1 ROCKET action is also no longer a moving debug square: action state 4 creates the stationary reserved type-4 object and displays the recovered rocket artwork.

At the far right of Level 1, the final-objective path now clears source #123, the recovered `Level1_GoalBarricadeSource`, allowing source #125/Nelson to stream. Nelson's first script instruction then applies the recovered boss camera/world bounds; from that point the no-return left boundary is intentional DOS behavior rather than the earlier permanent-barricade bug. T90 is retained as the recovered timer-400/200 controller that periodically spawns the animated T91 passer-by.

## Controls

- **O / P** — move left / right (arrow keys are viewer aliases).
- **Q** — jump / move up (`Up` is a viewer alias).
- **A** — move down (`Down` is a viewer alias).
- **Space** — FIRE / spray / current Bart action.
- **Running after a jump** — Space is **not required**. A normal `Q` jump starts with the `0x0200` walk cap; if `Q` is still held when Bart lands, DOS switches to the `0x0400` run cap and animation reload `1`. `O/P` may be pressed before or after takeoff. Releasing `Q` on the ground resets the cap to `0x0200`. `Q + Space` remains a separate optional DOS path that enables `0x0400` immediately at takeoff and consumes FIRE on that startup tick.
- **Hold A, tap Space** — cycle inventory; releasing **A** uses the selected item.
- **Level 1 storefronts** — stand still at the door and press **Q**; inside, **O/P** selects, **Space** buys and **A** exits.
- **F8** — Play/Pause simulation.
- **.** — one logical tick.
- **Bart** button — inspect Bart runtime state.
- **🛡 Invulnerable** — viewer-only normal-damage immunity. It deliberately does not set DOS `083D`, so Bart does not permanently blink.
- **Camera follows Bart** — toggle the follow camera.
- **modern debug HUD** — optionally show the DOM/debug counters over the DOS-style screen.

The DOS cheat sequences are also recognized by physical key code: **COWABUNGA** enables unlimited lives (`06F9h=AC`); **Numpad `-` + EATMYSHORTS** enables unlimited lives plus **F** level-complete (`06FAh=AC`). The original executable listened on startup/title presentation screens; this viewer has no equivalent title loop, so its detector remains available while the viewer is running, while preserving the recovered sequences and effects.

Bart's normal movement uses recovered DOS 8.8 fixed-point values. A normal jump starts at `-0x0400`; special negative-flag static terrain (the Level-1 parking-meter tops) starts a forced `09h` no-gravity hold at `-0x0580`, which produces the much higher bounce seen in DOS.

## Damage, health, lives and blink

v0.9 keeps the original Bart hit state instead of using one generic browser timer:

- `083B` — hit/death countdown. A normal damaging collision sets it to `0x32` (50 ticks).
- `083C` — blink phase.
- `083D` — invulnerability timer. `BeginBartHitInvulnerability` sets it to `0x64` and resets the phase to zero.
- `0770` — health counter, initialized to `1`. This behaves as a two-hit health buffer (`2/2`, then `1/2`).
- `076F` — lives, initialized to `3` at game start.

After the 50-tick hit phase, health is decremented. If the raw health counter becomes negative, one life is lost and Bart respawns. The exact DOS checkpoint tables are not modeled yet, so v0.9 respawns at the exported level start; this is explicitly temporary.

The viewer-only **Invulnerable** toggle is separate from these DOS fields and blocks ordinary damage before the `083D` state is started. Forced level-specific fall/time-out death paths remain separate.

The visible blink follows `BuildBartRenderObject`: while `083D != 0`, decrement the timer, advance `083C=(083C+1)&7`, and omit Bart from the render list whenever `(083C & 4) != 0`. In practice Bart is visible for four phases and hidden for four phases.

## DOS-style HUD and inventory

v0.9 keeps the logical game screen to **320×200** and renders the gameplay viewport plus a fixed DOS-style HUD in the same Canvas. The HUD uses the **original 8×8 character glyph bytes extracted from `VGA.OVL`** and is bound directly to recovered runtime state:

- packed-BCD **SCORE**;
- **LIVES**;
- packed-BCD **TIME**;
- packed-BCD **GOALS**;
- current inventory item/count;
- Level-1 spray meter (`0815`), Level-3 slingshot meter (`0782`), Level-4 dart meter (`0781`) and Level-5 special counter (`0780`);
- X-ray/alternate-graphics state.

The old modern HUD is retained only as an optional debug overlay.

The recovered inventory has 14 slots:

```text
0 EXIT         1 X-RAY SPECS   2 COIN       3 SPRAYCAN
4 CHERRY BOMB  5 ROCKET        6 WRENCH     7 MAGNET
8 WHISTLE      9 DONUTS       10 SLINGSHOT 11 DART GUN
12 KEY        13 PAUSE
```

The selector reproduces the DOS repeat/timeout state (`07D6/07DD`), skips zero-count items, and uses the recovered item-use jump-table rather than a browser-only menu. Implemented functional paths include X-ray toggle, coin/source trigger, cherry-bomb/rocket actions, wrench/magnet/whistle level gates, donuts, key teleport, pause, spray action hitbox and slingshot/dart projectile+submeter consumption. Collision handler 15 now consumes the reconstructed **separate Bart action hitbox**, not Bart's body hitbox.

Inventory counts remain packed BCD. Pickup handler 4 updates those counts and applies the recovered pickup-side effects for coin/spray/slingshot/dart meters.

### HUD/icon exactness note

The DOS **font bytes and gameplay state/selection logic are original/recovered**. The common item-icon metadata offsets are also preserved, but the `GENERAL.OVL` off-screen icon raster/blitter has not yet been decoded into standalone PNGs. v0.9 therefore renders compact pixel/font inventory symbols in the correct runtime slots rather than claiming those icon pixels are original. Cherry-bomb/rocket/donut/projectile transient graphics are likewise high-level reconstructions; their gameplay state and ammo/use rules are implemented, but their common transient graphics scripts are not yet pixel-exact.

## Clothesline / zero-height trigger lines

The DOS AABB helper permits a collision profile whose width or height is exactly zero. v0.6 incorrectly rejected those profiles. v0.9 only rejects negative extents, so a zero-height profile behaves as the original inclusive horizontal trigger line.

This fixes the Level-1 clothesline sheets: source #12/#13, type 63, handler 9 now transition through negative parameter `-128` into type 64, run the falling-sheet animation/`+0x0100` Y velocity, and settle as type 65. The negative transition also awards its recovered score/event and decrements the goal counter.

## Collision core

Collision geometry and dispatch come from the recovered DOS data rather than sprite pixels:

- Bart gameplay hitbox: **12×24** at `(BartX+2, BartY+4)`;
- per-type 12-byte `CollisionProfile` object hitboxes;
- a literal **43-entry TypeScript dispatch table** matching the DOS `Collision_HandlerJumpTable @ 5F67h`;
- object type-transitions immediately switch to the new type's collision profile/handler;
- `StaticTerrain` landing surfaces and `0x8000` springs;
- horizontal solids, one-way/moving platforms and handler-specific platform variants;
- handler-specific damage, transition, pickup, counter, pattern, bounce and progression paths where their required state is modeled.

`physics collisions` is the actual runtime switch and starts **ON**. `collision boxes` only draws debug geometry.

### Handler fidelity

The full mapping is documented in [`docs/COLLISION_HANDLER_MATRIX.md`](docs/COLLISION_HANDLER_MATRIX.md). v0.9 tracks all **43 DOS table entries** explicitly:

- **26 implemented** — their recovered branch can currently execute using modeled runtime state;
- **8 partial** — core/physical behavior is present, but a level-specific external/global side effect remains;
- **9 deferred** — they still require secondary/boss/linked-object state not yet produced by this runtime.

Deferred handlers deliberately do **not** fall back to Bart's normal body hitbox. Handler 15 remains implemented in v0.9: it uses the separate reconstructed spray/action hitbox; simply touching such an object with Bart's body still does not trigger it.

Representative DOS-specific branches now include:

- handler 1 signed parameter split: odd clear, even transition, zero damage; a transition path does not also damage Bart;
- handler 2 score/life pickup and consume;
- handler 3 top-contact break/counter/damage behavior;
- handler 4 inventory BCD counters plus known pickup effects;
- handlers 5/6 objective/event collection paths;
- handler 7 transition + low-nibble launch velocity table;
- handlers 8/9/13 airborne/grounded/descending transition gates;
- handlers 10/11/12/33/36 platform/solid variants;
- handler 19 `0xFA` invulnerability pickup;
- handler 22 feet-only damage/transition;
- handler 28 falling large-object hazard;
- handler 29 low byte of `GameObject+2C` gate;
- handler 30 `0766/0780/0784` progression latch;
- handler 31 the recovered nine-entry airborne pattern sequence;
- handler 32 score + `076A += 4` sequence pickup;
- handler 34 its special `velocityY -= 0x0100` upward bounce rule;
- handler 37 moving hazard/landing transition;
- handler 40 counter/goals/progression loop;
- handler 42 rising-object activation gate.

### Special static sprite bank fix

A small family of scripts uses `SetStaticFrame` operands that are **not 12-byte aligned**. They are direct IDs into the Bart/common descriptor bank, not byte offsets into the object descriptor table. Examples:

```text
Level 1: types 15..18 -> 117,116,119,118
Level 2: types 97..98 -> 25,26
Level 5: types 33..35 -> 25,26,27
```

Level-1 source #0 / type 15 at X=88 is the visible regression case: `SetStaticFrame(0x0075)` now resolves to **Bart/common descriptor #117** instead of incorrectly dividing 117 by 12 and looking for object descriptor #9. The spring behavior at that position remains the separate StaticTerrain spring.

## Object pool, story VM and inspector

v0.9 replaces the old one-runtime-object-per-source model with a fixed **28-slot runtime pool**. Persistent `LevelObjectSource` records stream in around the gameplay camera, set/clear the DOS-style loaded flag, and share the same pool with transient child objects. The special `0x0100` source-load gate is still approximated, so this is much closer to DOS but not claimed bit-exact.

`SpawnChild` and `SpawnChildAfterCurrent` now allocate real transient slots, preserve parent links and relative coordinates, and retry/skip when the DOS allocation rule cannot find a slot. `SetGlobalEventData` now feeds decoded event-message state. Known Level-1 native FAR callbacks execute their recovered side effects; the prank-call native uses the original eight-entry branch table, while the viewer PRNG itself is deterministic rather than claiming the exact DOS seed.

This is enough for the **Level-1 payphone/Moe storyboard to run from original data**: COIN activates the dormant phone source, the VM rings, publishes the original message data, spawns speech-bubble children, branches into a prank call, and eventually spawns type 11 Moe. Text placement inside the bubble is reconstructed with the original DOS font; it is not yet a pixel-exact recreation of the platform text blitter.

Selecting an active object now shows the full decoded VM script with live `CURRENT`, `WAITING`, `BLOCKED`, branch/executed state, visit counts, last execution tick, wait origin/resume/condition details, native branch details and a rolling execution history.

## Implemented object VM/runtime subset

- exact script-delay scheduling;
- `Wait`;
- `SetAnimation`;
- `SetStaticFrame`;
- `Goto`;
- `PlaySound` as a logical event;
- velocity/acceleration opcodes;
- `StopMotion`;
- `DetachSource`;
- `SetTypeAndPersistY`;
- `WaitUntilYAtLeast`;
- flag 1000 set/clear;
- `SetGlobalEventData` + decoded Level-1/5 event-message state;
- `SpawnChild` / `SpawnChildAfterCurrent` using the 28-slot pool;
- `TriggerGlobalEventSound4`;
- `DecrementObjectiveCounterBCD` now feeds the live goal counter;
- `Despawn`;
- recovered fixed-point object motion;
- exact animation timer/frame wrap sequence.

Known Level-1 `CallNativeFar` callbacks are modeled directly, including the multi-target prank-call selector and recovered flag/motion helpers. Unknown natives still pass only when the exported CFG has one deterministic continuation; unresolved ambiguous native choices remain visibly blocked.

## Visual Studio

Open either:

- `retro-mutant.slnx`, or
- `retro-mutant.esproj`.

For TypeScript/browser debugging, choose **Simpsons Viewer (Edge)** (or Chrome) in the Start/debug dropdown and press **F5**. Visual Studio runs `npm run dev`, opens `http://localhost:5173` under the browser debugger, and binds `src/**/*.ts` breakpoints through the checked-in source maps.

If packages are not restored automatically, run once:

```powershell
npm install
```

To verify the debug configuration and source-map path locally:

```powershell
npm run debug-check
```

If browser breakpoints remain unbound, close all existing Edge/Chrome windows and start F5 again; an already-running Chromium instance can prevent Visual Studio from launching its debug-enabled browser process.

## Tests

Run:

```powershell
npm run smoke
```

The smoke suite now verifies:

1. all five levels + ScriptVM/Bart runtime;
2. terrain landing/spring, horizontal solid, one-way platform and hazard collision;
3. separate hit/death + invulnerability timers, health/lives and exact blink gating;
4. HUD timer/goals and proven pickup side effects;
5. the Level-1 source #0 special static sprite plus every known unaligned L1/L2/L5 static-frame family;
6. all 43 collision table entries and their recovered DOS offsets;
7. every exported Level 1–5 collision profile points to a known handler entry;
8. DOS-specific regression branches for handlers 1, 15, 29, 30, 31, 32 and 34;
9. zero-height Level-1 clothesline trigger → falling/settled sheet transition;
10. 14-slot inventory metadata, selector/use flow, X-ray, source triggers, key teleport, spray hitbox, slingshot meter/projectile and pause.

## Data

Generate the Level 1–5 gameplay JSON, object frame PNGs and **416 original Bart descriptor PNGs** locally using the instructions above. `player_runtime.json` contains the recovered per-level Bart/config values, including initial packed-BCD goals and the recovered progress/inventory source pointers used by item actions.


See `docs/LEVEL_HANDLERS.md` for the typed per-level handler lifecycle and Level-1 code map.

See [`docs/DOS_FUNCTION_CATALOG.md`](docs/DOS_FUNCTION_CATALOG.md) for the recovered DOS function addresses, names, behavior, internal state-machine blocks and overlay entrypoints, with source references and research confidence.

## Legal and attribution

This is an unofficial hobby project created for fun, learning and exploring how the original DOS game works. We respect the original creators and rights holders and have no intention of infringing their copyrights or trademarks. This project is not affiliated with, endorsed by or sponsored by the owners of *The Simpsons* or *Bart vs. the Space Mutants*. All rights in the original game, characters, names, artwork, music and other original materials remain with their respective owners.

The repository provides the reimplementation and extraction tools without distributing the original game files or decoded game assets. Users must supply a lawfully obtained copy of the supported DOS game and generate the required assets locally. Do not commit or redistribute original game files or extracted assets through this repository. The [MIT license](LICENSE) covers this project's original contributions; it does not grant rights to the original game or any third-party material.

This statement describes our intentions and does not grant permission to use protected material or establish that a particular use is legally permitted. If you are a rights holder with a concern, please contact the maintainer through this repository so it can be reviewed and addressed.
