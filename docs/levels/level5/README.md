# Level 5: research and implementation status

[Level index](../README.md) · [Function catalogue](../../DOS_FUNCTION_CATALOG.md#level5)

## 1. Current status

**Research viewer support, not a complete level implementation.** The registry uses `EmptyLevelHandlers` for this level. Shared motion, scripts and supported collision branches can run, but unsupported native calls may block. No complete original story/progression replay has been verified.

| Evidence | Location |
| --- | --- |
| EXE metadata/native segment | 1556 |
| Root per-frame player routine | 0000:4682 |
| Local generated data | wwwroot/data/level5 |
| Additional embedded native candidates in the census | 3 |

Candidate counts indicate addresses to review, not confirmed functions or completion percentages.

## 2. Recovered behavior and story gaps

The recovered Level-5 per-frame dispatcher uses primary and secondary special-sequence states. Several entries are state-machine continuations rather than independent gameplay systems.

| Routine | Recovered role | Research confidence |
| --- | --- | --- |
| 0000:4783 | Shared implementation for primary states including 16h/22h | Not graded |
| 0000:4790 | Primary state 02h, descriptor/spawn behavior and advancement | Not graded |
| 0000:4B02 | Read field +3Ch of the selected sequence descriptor | High |
| 0000:4B50 | Dispatch secondary state DS:07F5 | High |

The exporter includes five messages beginning at 1556:1A20. Their presence does not mean their entire original trigger/presentation sequence is implemented. The shared inventory code retains the recovered restriction that item 1 does not activate X-ray in Level 5.

## 3. Implementation plan

1. Recover the primary/secondary state transitions and descriptor ownership.
2. Identify the callers and object effects of each state, not just its entry address.
3. Implement Level5Handlers and route its message/HUD behavior there.
4. Test sequence reset, state transitions and completion independently of other levels.

Use the [typed handler lifecycle](../../LEVEL_HANDLERS.md) instead of accumulating level-number branches throughout the engine. Unknown events stay explicitly unproven; do not borrow mechanics from another platform.

## 4. Validation boundary

`npm run smoke` loads this level's exported data, exercises shared runtime paths and checks that collision indices refer to the known table. It does not validate this level's full story, all native branches, boss or completion.

For a new event, test its original trigger, intermediate script/native states, persistent side effects, failure/miss cases and reset. Update this chapter when those tests exist.
