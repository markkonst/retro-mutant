# Level 2: research and implementation status

[Level index](../README.md) · [Function catalogue](../../DOS_FUNCTION_CATALOG.md#level2)

## 1. Current status

**Research viewer support, not a complete level implementation.** The registry uses `EmptyLevelHandlers` for this level. Shared motion, scripts and supported collision branches can run, but unsupported native calls may block. No complete original story/progression replay has been verified.

| Evidence | Location |
| --- | --- |
| EXE metadata/native segment | 0C8C |
| Root per-frame player routine | 0000:3A1A |
| Local generated data | wwwroot/data/level2 |
| Additional embedded native candidates in the census | 30 |

Candidate counts indicate addresses to review, not confirmed functions or completion percentages.

## 2. Recovered behavior and story gaps

The catalogued per-frame routine handles Level-2 player rules, including fall/death regions. Some branches set Bart's health to zero and enter the shared hit/death handler. A level can therefore look plausible with shared movement while still missing its original death and progression conditions.

The data export contains original placements, types, collision profiles and scripts. It does not yet establish a validated end-to-end story or boss sequence. No complete Level-2 story chain is claimed here.

## 3. Implementation plan

1. Recover the inputs and branch boundaries of the fall/death rules at 0000:3A1A.
2. Trace native calls in the exported object scripts and identify their source events.
3. Introduce a Level2Handlers set and register it.
4. Test death/reset, progression and completion using actual source/script transitions.

Use the [typed handler lifecycle](../../LEVEL_HANDLERS.md) instead of accumulating level-number branches throughout the engine. Unknown events stay explicitly unproven; do not borrow mechanics from another platform.

## 4. Validation boundary

`npm run smoke` loads this level's exported data, exercises shared runtime paths and checks that collision indices refer to the known table. It does not validate this level's full story, all native branches, boss or completion.

For a new event, test its original trigger, intermediate script/native states, persistent side effects, failure/miss cases and reset. Update this chapter when those tests exist.
