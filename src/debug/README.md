# Viewer debug workbench

These modules sit **above** the game runtime. Nothing under `src/game` imports them.

- `Level1DebugTools` prepares named test fixtures using the public mutable world state and existing reset API. It never calls private game methods, patches prototypes or implements a story event.
- `DebugWorkbench` owns preset buttons, the 28 physical slot rows and a read-only current-frame canvas.
- `App` connects them to the current world, clears held input, updates camera/selection and advances one ordinary update to populate a fresh scene.

## Presets

Scene jumps reset Level 1 before placing Bart and granting inventory. This intentionally clears previous progress, arena bounds, used sources and in-flight actions. The buttons say “Fresh scene”.

Nelson clears objectives but leaves the boss alive. Nelson + Maggie also enables the helper source. Hospital supplies rockets, bombs and a whistle; rockets start selected, and the whistle still triggers Grandpa through ordinary inventory logic. Jebediah, the bomb target, cinema timer 400 and payphone each prepare their own original trigger.

Current-scene actions refill inventory, clear objectives/open the gate, enable Maggie or restore health/time/lives. They do not certify that objectives were completed normally. The separate toolbar invulnerability toggle remains optional.

Counts use packed BCD. Clearing the gate must clear both its source flags and any already active slot, otherwise a ghost collider remains. Original exported source records are never mutated; the world owns working copies.

## Inspection

Slot selection follows the physical array index, including free slots, transient children and slot reuse. Free slots show no stale sprite. The reserved player projectile is reported separately because it is not part of the 28-slot array.

The preview draws the current decoded image, not a second animation clock. Pausing or stepping therefore pauses/steps it with the game. It follows the current X-ray palette, preserves transparency and reports missing/controller frames instead of inventing an image. It is a sprite preview, not a reproduction of every scene-specific rendering effect.

The inspector retains VM script/history and adds source flags, fractions, link/motion fields, render offset, special render bytes and descriptor geometry.

## Verification

`npm run smoke` includes `tools/smoke-debug-presets.mjs`. It checks actual Nelson/Maggie streaming, hospital rocket/whistle behavior, cinema and phone triggers, loaded-gate removal, arena reset isolation and original-data immutability. UI preview/slot selection also need browser checks.
