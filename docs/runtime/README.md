# Runtime: reading the TypeScript

[Documentation home](../README.md) · [Contributing](../../CONTRIBUTING.md)

The runtime translates recovered DOS behavior into typed, inspectable components. It does not execute the game EXE. Original scripts and tables remain data; TypeScript supplies the machinery that interprets them.

## 1. Code map

| Component | Job |
| --- | --- |
| [App](../../src/ui/App.ts) | Load a level, connect controls, run the UI |
| [AssetRepository](../../src/game/AssetRepository.ts) | Load local images and decoded JSON |
| [RuntimeWorld](../../src/game/RuntimeWorld.ts) | Own gameplay state and coordinate updates |
| [BartPlayer](../../src/game/BartPlayer.ts) | Player motion, jump and animation state |
| [InventorySystem](../../src/game/InventorySystem.ts) | Item selection, activation and reserved player actions |
| [ScriptVm](../../src/game/ScriptVm.ts) | Execute decoded object scripts |
| [CollisionSystem](../../src/game/CollisionSystem.ts) | Terrain, contact and gameplay hit rules |
| [LevelHandlerRegistry](../../src/game/levels/LevelHandlerRegistry.ts) | Select one set of level-specific hooks |
| [WorldViewer](../../src/game/WorldViewer.ts) | Draw the scene and research overlays |
| [DosHudRenderer](../../src/game/DosHudRenderer.ts) | Draw HUD state with the extracted font |

Read `RuntimeWorld.tick()` before changing update order. Player movement, script waits, action hitboxes and collisions depend on the state produced earlier in that update. Audio has its own clock; drawing is separate from gameplay.

## 2. DOS numbers without assembly experience

- `0200h` and `0x0200` are two ways of writing hexadecimal 512.
- Signed 8.8 fixed point divides an integer by 256: 0200h is +2 pixels/update; FF80h is -0.5.
- `u16` preserves unsigned 16-bit wrap; `s16` interprets the same bits as signed. FFFFh may mean 65535 or -1 depending on the instruction.
- Packed BCD stores decimal digits in nibbles: 24h means decimal 24, not binary 36. Inventory and goals use BCD in relevant original paths.
- A FAR address has a segment and offset. In a flat extracted image, use `segment * 16 + offset`; an overlay has its own image.

Preserve the original signedness, wrap and timer phase. Replacing them with “simpler” ordinary JavaScript arithmetic can change branches.

## 3. Movement and controls

O/P move, Q jumps, A is down/inventory and Space is FIRE. Arrows are browser aliases. Holding A and tapping Space advances the item; releasing A uses it.

A normal jump starts with the walking speed cap. Holding Q through landing enables the recovered running cap; Space is not required. Q + Space is a separate fast-start path. The parking-meter terrain bounce has a stronger initial upward velocity and a short no-gravity hold.

The root README lists normal controls. Additional research controls include object/Bart inspection, camera following, collision and terrain overlays, F8 pause and Period single-step. Viewer invulnerability is distinct from the DOS invulnerability timer.

The recovered COWABUNGA sequence gives unlimited lives. Numpad-minus followed by EATMYSHORTS also enables F to finish the level. The browser accepts these during gameplay because the original startup/title input loop has not been recreated. These cheats do not establish completion fidelity.

## 4. Damage, inventory and HUD

Health, remaining lives, invulnerability and hit/death animation state are separate. A debug immunity switch must not set the DOS blink timer indefinitely. Likewise, purple objectives, helper tokens and other progression counters are distinct.

The HUD reads gameplay state and uses the original extracted font. Some icons, letter layout, shop panels and text presentation are reconstructions. See [inventory/HUD](../INVENTORY_AND_DOS_HUD.md) for the 14 item slots and dispatch details.

## 5. Level boundaries

Shared movement/VM/collision behavior belongs in the engine. Rules tied to a particular street, boss, item location or native segment belong in that level's handler set. The registry unloads the previous set before initializing another, and reset restores level-specific state.

Read [level architecture](../LEVEL_HANDLERS.md) and [per-level status](../levels/README.md) before implementing new branches.

## 6. Viewer-only test workbench

Below the game, the left panel prepares Level-1 scenes, the middle panel shows all 28 physical object slots, and the right panel previews the selected current frame and its runtime/VM state. Fresh-scene shortcuts reset progress; other actions retain it. The implementation lives in [src/debug](../../src/debug/README.md), outside the game engine.
