# Documentation guide

[Project and setup](../README.md)

The project has three separate jobs: extract original DOS data, interpret it in a new runtime, and display or play the result. Understanding one does not imply the others are complete.

## Recommended reading order

1. [Assets](assets/README.md): where the images, tables and scripts come from.
2. [Runtime](runtime/README.md): how player input, objects, collisions and drawing fit together.
3. [ScriptVM](scriptvm/README.md): how an object executes the original scripts.
4. [Collisions](collisions/README.md): how contact and weapons trigger gameplay changes.
5. [Levels](levels/README.md): the story chains and special code for each level.
6. [Audio](audio/README.md): an independent driver clock, music sequencer and sound output.

No assembly experience is required for the introductions. Addresses in the detailed references let researchers verify claims against the supported DOS files.

## References

| Reference | What it answers |
| --- | --- |
| [DOS function catalogue](DOS_FUNCTION_CATALOG.md) | What each catalogued entrypoint does, and confidence in that interpretation |
| [Function census](DOS_FUNCTION_CENSUS.md) | How many entries are catalogued versus additional unvalidated candidates |
| [Collision matrix](COLLISION_HANDLER_MATRIX.md) | All 43 dispatch slots and their implementation status |
| [Level handler API](LEVEL_HANDLERS.md) | Typed hooks and load/reset/dispose lifecycle |
| [Inventory and HUD](INVENTORY_AND_DOS_HUD.md) | Item dispatch, counts, timers and presentation limits |
| [Object pool and inspector](OBJECT_POOL_AND_STORY_VM.md) | Source records, 28 live slots and execution traces |
| [Level-1 story evidence](LEVEL1_STORY_RESEARCH.md) | Detailed cinema, Maggie and Jebediah findings |
| [Ghidra runtime reference](GHIDRA_RUNTIME_REFERENCE.md) | Supporting reverse-engineering notes |
| [Third-party audio](THIRD_PARTY_AUDIO.md) | OPL emulator attribution |

## How to read status claims

- **Recovered behavior** describes evidence from DOS code/data.
- **Implemented** describes a TypeScript path representing that behavior.
- **Tested** means the named test exercises stated conditions.
- **Partial / reconstructed** marks missing effects or approximate presentation.
- **Unproven** means evidence is insufficient, even if another port or a walkthrough suggests a feature.

A passing isolated event test is not a complete level replay. The catalogue's confidence grades are not percentages of the game completed.
