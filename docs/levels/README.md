# Levels: story events and special handlers

[Documentation home](../README.md) · [Handler architecture](../LEVEL_HANDLERS.md)

The shared engine reads all five level exports. It does not yet implement all five levels' native rules. This section keeps each level's story, progression and special handlers together.

| Level | EXE data segment | Handler set | Guide |
| --- | --- | --- | --- |
| 1 | 096D | Level1Handlers | [Level 1](level1/README.md) |
| 2 | 0C8C | EmptyLevelHandlers | [Level 2](level2/README.md) |
| 3 | 0F6B | EmptyLevelHandlers | [Level 3](level3/README.md) |
| 4 | 1239 | EmptyLevelHandlers | [Level 4](level4/README.md) |
| 5 | 1556 | EmptyLevelHandlers | [Level 5](level5/README.md) |

“Empty” refers to level-specific callbacks. Shared scripts, terrain and supported collision handlers can still run. Unknown native calls can block, and loading a map does not establish story completion.

The registry owns one active handler set, disposes it before changing levels, initializes the replacement and resets it on restart. Hooks cover the player step, inventory use, native script calls, spawned children, HUD and interaction panels. See [LEVEL_HANDLERS.md](../LEVEL_HANDLERS.md) for the interface and callsites.

## Adding a level feature

Trace the source/script chain and any native branch first. Record the original segment/address and required shared state. Add the behavior to that level's handler set, register the set, then test both activation and reset/level switching. Keep graphics presentation uncertainty separate from gameplay state.

These chapters deliberately do not fill unknown DOS behavior with memories or rules from other ports.
