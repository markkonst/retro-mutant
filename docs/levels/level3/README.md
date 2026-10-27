# Level 3: research and implementation status

[Level index](../README.md) · [Function catalogue](../../DOS_FUNCTION_CATALOG.md#level3)

## 1. Current status

**Research viewer support, not a complete level implementation.** The registry uses `EmptyLevelHandlers` for this level. Shared motion, scripts and supported collision branches can run, but unsupported native calls may block. No complete original story/progression replay has been verified.

| Evidence | Location |
| --- | --- |
| EXE metadata/native segment | 0F6B |
| Root per-frame player routine | 0000:3A75 |
| Local generated data | wwwroot/data/level3 |
| Additional embedded native candidates in the census | 33 |

Candidate counts indicate addresses to review, not confirmed functions or completion percentages.

## 2. Recovered behavior and story gaps

The recovered Level-3 code is more than a horizontally scrolling map. It contains area/section transitions and a pattern puzzle state machine.

| Routine | Recovered role | Research confidence |
| --- | --- | --- |
| 0000:3BBB | Decide whether the active world section should change | Medium-high |
| 0000:3C2F | Dispatch even-valued special state DS:07EF | High |
| 0000:3F3D | Remove linked live objects, reset pattern/source state, advance substate | Not graded |
| 0000:43CF | Toggle pattern bits from a table terminated by a negative byte | High |
| 0000:43EE | Restore mutable source records for the puzzle | High |
| 0000:442E | Constrain/reposition Bart while traversing special zones | Medium-high |
| 0000:45A1 | Rebase Bart/camera, rebuild streaming state and resume gameplay | High |

These are catalogue interpretations of original code, not implemented Level-3 features. Pattern state mutates persistent placement records; visual animation alone would not implement the puzzle. The catalogue includes additional item/message/checkpoint routines.

## 3. Implementation plan

1. Separate the section-transition state from ordinary camera scrolling.
2. Trace the DS:07EF state machine and its pattern/source mutations.
3. Recover inventory/message hooks, including their location and state gates.
4. Add Level3Handlers with tests for revisiting sections, reset and puzzle persistence.
5. Validate a complete story/progression route before calling the level playable.

Use the [typed handler lifecycle](../../LEVEL_HANDLERS.md) instead of accumulating level-number branches throughout the engine. Unknown events stay explicitly unproven; do not borrow mechanics from another platform.

## 4. Validation boundary

`npm run smoke` loads this level's exported data, exercises shared runtime paths and checks that collision indices refer to the known table. It does not validate this level's full story, all native branches, boss or completion.

For a new event, test its original trigger, intermediate script/native states, persistent side effects, failure/miss cases and reset. Update this chapter when those tests exist.
