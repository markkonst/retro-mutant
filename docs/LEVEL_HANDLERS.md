# Level-specific handler architecture

This worktree keeps DOS engine mechanics generic and loads one typed level-specific handler set at a time.
The goal is that Visual Studio **Find All References** leads from an engine event point to the level implementation without string-based event names or scattered `if (level === N)` blocks.

## Lifecycle

1. `App.loadLevel()` calls `world.dispose()` on the old runtime.
2. `RuntimeWorld.dispose()` calls `LevelHandlerRegistry.unload()`.
3. A new `RuntimeWorld` creates a `LevelRuntimeServices` bridge and calls `LevelHandlerRegistry.load()`.
4. `load()` always unloads any previous set first, constructs the new level handler set and calls `initialize()`.
5. `RuntimeWorld.reset()` keeps the same set but calls its `reset()` method.

Current factory mapping:

- Level 1 -> `levels/level1/Level1Handlers.ts`
- Levels 2-5 -> `EmptyLevelHandlers` until their recovered behavior is migrated.

## Typed engine event points

| Engine event | Generic call site | Registry method | Level-1 implementation |
| --- | --- | --- | --- |
| Per-frame level player dispatch | `RuntimeWorld.tick()` before generic Bart motion | `beforePlayerStep()` | `Level1PlayerHandlers` |
| Inventory item use | `InventorySystem.useSelectedItem()` | `handleInventoryItemUse()` | `Level1InventoryHandlers` |
| VM FAR native | `ScriptVm` -> `RuntimeWorld` delegate | `handleNativeCall()` | `Level1NativeHandlers` |
| VM child spawned | `RuntimeWorld.spawnChild()` | `onChildSpawned()` | `Level1PresentationHandlers` |
| HUD level meter | `DosHudRenderer.drawLevelMeter()` | `getHudMeter()` | `Level1PresentationHandlers` |
| Modal level interaction | `DosHudRenderer` / player dispatch | `getInteractionOverlay()` | `Level1ShopHandlers` |

Inventory dispatch is deliberately performed for **every** selected item before the common switch. A future Level-3 handler can therefore own MAGNET, or a Level-5 handler can own X-RAY restrictions, without editing the common inventory switch again.

## Level 1 code currently modeled and moved

### Inventory/world binding

`Level1InventoryHandlers.ts`

- COIN/payphone location rule (`BartY=62h`, `BartX>>3=69h`).
- Activation of `LevelRuntimeConfig.progress_source_offset` with flag `8000h`.

The generic COIN routine remains as a fallback because the original shared DOS inventory routine is not itself level-number gated.

### 096D native callbacks

`Level1NativeHandlers.ts` now explicitly accounts for every Level-1 native name referenced by the decoded Level-1 object scripts:

- `Level1Native_SetObjectFlag1000`
- `Level1Native_SetObjectLinkField2A`
- `Level1Native_ToggleFlag1000AndCountdownField2A`
- `Level1Native_RegisterCurrentObjectAsBoss`
- `Level1Native_NelsonChooseAttackOrDeath`
- `Level1Native_ToggleLevelFinishedFlag`
- `Level1Native_BranchAtTimer400Or200`
- `Level1Native_BranchIfType67AtRecord0599`
- `Level1Native_SelectRandomScriptFromTable`
- `Level1Native_SetRandomVelocityX`
- `Level1Native_SetAccelYFromBartDistance`
- `Level1Native_SetRuntimeFlag0080`
- `Level1Native_SetLocalEventFlag`
- `Level1Native_BranchIfLocalEventFlagSet`

Level-1-only constants/tables live in `Level1Constants.ts`.

### Presentation

`Level1PresentationHandlers.ts`

- type 13/14 child objects snapshot the current global event text for speech bubbles.
- the Level-1 `SPR` HUD meter is supplied from DS:0815-equivalent spray state.

### Player dispatch / skateboard path

`Level1PlayerHandlers.ts` is wired at the recovered `LevelSpecificPlayerDispatch` position: before the common Bart jump/horizontal update. The handler now takes ownership only for `0D6Ch <= BartX < 2180h`, matching `LevelSpecificPlayer_Level1` at `38ECh`; outside that interval it returns to the common Bart path.

Modeled skateboard state includes:

- `DS:084C/084D` right/left input latches;
- `DS:084E` signed `±0200h` push impulse;
- `DS:0850` push-animation state and shared `DS:085C` timer;
- `DS:0852` skateboard active gate;
- `DS:082C` low-byte 8.8 X accumulator and `±0800h` speed clamp;
- grounded FIRE + `01h/02h` up/down adjustment of Bart Y / `DS:0860` from `72h..80h`;
- the default skateboard camera band;
- descriptor base `40h`, or `5Ah` while spray-can inventory byte `DS:0775` is nonzero;
- source #53 (`03FFh`) and #83 (`052Bh`) type-61 boundary disable/restore.

The handler reuses typed bridges back to the generic jump-state routine, static-terrain resolver, Bart descriptor resolver and camera state rather than duplicating those engine mechanisms.

### Storefront special sequence

`Level1ShopHandlers.ts` models the recovered `Level1_DispatchSpecialSequenceState @ 4C09h` storefront path. `Level1PlayerHandlers` checks the `0600h..08FFh` range, Q/up, zero X velocity, BartY `007Ah`, and the three `BartX>>4` trigger keys. The handler then owns states `02/04/06/08/0A/0C/0E/10`, selection/fire latches and the three recovered DS shop records.

State `08` uses A/down to exit, O/P to select and Space to purchase. Coins and item counts are packed BCD while per-shop stock words are binary. State 02/06 reserve the same four 0x30-byte transient runtime slots through a generic `AllocateTransientGraphicObject` equivalent; state 0A/10 clears them and state 0C repoints the primary graphic offset. The original graphic offsets (`3056h`, `3062h`, `306Eh`, `307Ah`, `3092h`, `30A6h`, `30BEh`) are retained but are not yet decoded as browser-renderable common-overlay rasters; `DosHudRenderer` therefore supplies a clearly reconstructed DOS-font presentation.

## Recovered Level-1-only DOS code not yet modeled

- The Bart X `>=30BCh` Level-1 branch that seeds Bart action state 6.
- Exact common-overlay transient raster/blitter semantics for the storefront `30xx` graphics.
- The alternate `DS:1598` skateboard camera/movement branch remains incomplete.

## Level-1 data that stays data

The following are level-specific but should **not** be rewritten as TypeScript handlers:

- object source records
- object type/script pointer tables
- direct-threaded object scripts
- collision profiles
- static terrain
- Bart/object sprite descriptors and images
- palette/config/runtime tables

They are already loaded from `wwwroot/data/level1/*.json` and remain data-driven.

## Engine code deliberately kept generic

These mechanisms are shared DOS engine behavior and are not Level-1 handlers:

- 28-slot runtime object pool and source streaming
- source activation itself (`activateSourceRecord`)
- `SpawnChild` / `SpawnChildAfterCurrent`
- `SetGlobalEventData`
- object VM opcodes, waits and branches
- collision dispatcher and handler-number semantics
- zero-height AABB support
- inventory selection/count bookkeeping
- spray action/ammo/hitbox mechanics
- generic object type transitions

Per-level collision **profiles** determine which generic collision handler an object uses.

## Known legacy level checks still to migrate when Levels 2-5 are handled

The registry is ready, but the current common runtime still contains behavior belonging to later levels, notably:

- Level 5 X-RAY restriction in `InventorySystem`.
- Level 3 MAGNET location/trigger in `InventorySystem`.
- Level 3/4/5 HUD meter branches in `DosHudRenderer`.

These are intentionally listed rather than silently pretending Levels 2-5 have already been refactored.

## Adding Level 2

1. Create `src/game/levels/level2/Level2Handlers.ts` and any focused sub-handlers (`Player`, `Inventory`, `Native`, `Presentation`).
2. Implement `LevelHandlerSet`.
3. Add the Level-2 factory case in `LevelHandlerRegistry.load()`.
4. Move only proven Level-2-specific behavior from common code to typed event handlers.
5. Add lifecycle + behavior regression tests before removing the old common branch.
