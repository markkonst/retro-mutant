# Level 4: research and implementation status

[Level index](../README.md) · [Function catalogue](../../DOS_FUNCTION_CATALOG.md#level4)

## 1. Current status

**Research viewer support, not a complete level implementation.** The registry uses `EmptyLevelHandlers` for this level. Shared motion, scripts and supported collision branches can run, but unsupported native calls may block. No complete original story/progression replay has been verified.

| Evidence | Location |
| --- | --- |
| EXE metadata/native segment | 1239 |
| Root per-frame player routine | 0000:462F |
| Local generated data | wwwroot/data/level4 |
| Additional embedded native candidates in the census | 36 |

Candidate counts indicate addresses to review, not confirmed functions or completion percentages.

## 2. Recovered behavior and story gaps

The catalogue identifies the Level-4 per-frame player dispatcher and its action/progression role. The current documentation does not have enough audited detail to claim the level's story events, boss behavior or completion conditions are implemented.

Its source/type/script data is exported, and shared VM/collision behavior can execute. Native-dependent branches need research and a real Level4Handlers implementation. The native candidates in the census are useful starting points, not already explained functions.

## 3. Implementation plan

1. Inspect 0000:462F and identify state/position gates.
2. Match the 1239 native operands to source/type chains in the exported scripts.
3. Describe each event's trigger, side effects and persistence before implementing it.
4. Add a Level4Handlers set and tests for reset, native branching and progression.

Use the [typed handler lifecycle](../../LEVEL_HANDLERS.md) instead of accumulating level-number branches throughout the engine. Unknown events stay explicitly unproven; do not borrow mechanics from another platform.

## 4. Validation boundary

`npm run smoke` loads this level's exported data, exercises shared runtime paths and checks that collision indices refer to the known table. It does not validate this level's full story, all native branches, boss or completion.

For a new event, test its original trigger, intermediate script/native states, persistent side effects, failure/miss cases and reset. Update this chapter when those tests exist.
