# Collisions: geometry, dispatch and gameplay effects

[Documentation home](../README.md) · [Complete handler matrix](../COLLISION_HANDLER_MATRIX.md)

A collision is not always “Bart touches a rectangle”. Some rules use Bart's feet, a weapon action line, a stationary rocket point, a falling bomb or a boss rectangle. Applying a generic body-overlap rule to all of them creates incorrect events.

## 1. Original data

Each object type has a 12-byte collision profile in the EXE: handler-table offset, X offset, width, Y offset, height and transition parameter. Extraction adds the resolved `collision_index`. The original dispatch table is at root `0000:5F67` and has 43 slots, including slot zero for no collision.

The runtime looks up the profile for the object's current type. A type transition therefore changes both script behavior and collision semantics.

Static terrain is separate: six-byte records describe horizontal spans and Y/flags. Terrain supports landing and special bounce behavior; object profiles handle dynamic contacts.

## 2. Resolution and side effects

[CollisionSystem.ts](../../src/game/CollisionSystem.ts) resolves physical contacts and dispatches the recovered gameplay branches. Previous and current positions are needed to distinguish landing/crossing from merely overlapping.

A successful hit can change type, consume an object, alter a source record, award score, decrement BCD goals, queue sound or damage Bart/a boss. The signed transition parameter must be interpreted by the relevant handler rather than treated as an ordinary type number.

Persistent source mutations matter: a changed placement must retain the appropriate state when it streams out and back in. Runtime-only movement is not a substitute for that mutation.

## 3. Representative paths

| Interaction | Handler(s) | What matters |
| --- | --- | --- |
| Spray | 15 | Facing-dependent action hitbox; hit counter and signed transition |
| Cherry bomb | 16 | Reserved type 2 and its original positional gate |
| Rocket | 17 | Reserved type 4, point geometry and horizontal velocity equal to zero |
| Nelson shot | 18 | Reserved type 6, 8×8 hitbox, one HP damage |
| Maggie's ball | 8 then 14 | Airborne Bart redirects it; boss contact removes three HP |
| Alien token | 6 | Separate helper count; sixth token activates the configured source |
| Moving platform | 12 | Descending landing and horizontal carry |
| Awning countdown | 20 | Mutating an external source's flags/countdown |

The rocket check being restricted to stationary horizontal motion is intentional DOS behavior. Test the explosion phase rather than assuming every moving frame must collide.

## 4. Current coverage

The matrix and regression report **30 implemented, 7 partial and 6 deferred slots**. Forty-two indices are referenced by the exported level profiles; the table still has all 43 entries.

“Implemented” means the recovered branch is represented with available state, not that all five levels are fully playable. “Partial” identifies remaining external/presentation effects. “Deferred” means required linked/reserved state is not yet produced. Deferred handlers must not silently fall back to Bart's body rectangle.

Recent verified changes include:

- The closed Level-1 end gate allows Bart to retreat when touching its edge; touching while moving away no longer clears that movement.
- Handler 6 advances helper letters rather than unrelated counter 0766; purple goals are unchanged.
- Handlers 14/18 feed Nelson's defeat state with three/one HP damage respectively.
- Original bomb/rocket scripts now produce the reserved objects tested by handlers 16/17.

Handler 21's linked-object sequence is still deferred. The existence of a decoded profile is not an implementation.

## 5. Tests and how to add one

Run `npm run smoke`. `smoke-collision-matrix.mjs` checks table indices/offsets and all exported profiles. Geometry and gameplay tests then exercise actual paths: `smoke-collisions.mjs`, `smoke-collision-extended.mjs`, `smoke-rockets.mjs`, `smoke-level1-boss.mjs`, `smoke-level1-items-story.mjs` and `smoke-level1-secrets.mjs`.

A useful regression includes both hit and miss conditions, the required motion state, the resulting type/counter, and persistence where relevant. Isolated setups may grant items or disable damage; document those assumptions.

For every change, update the [matrix](../COLLISION_HANDLER_MATRIX.md) and the affected [level chapter](../levels/README.md). Keep research confidence in the [function catalogue](../DOS_FUNCTION_CATALOG.md) separate from these implementation labels.
