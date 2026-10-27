# DOS function census

[Documentation home](README.md)

This is a static inventory, not a certified total or a decompilation percentage.
It distinguishes the existing catalogue from additional callable-address candidates.
No original instruction bytes or assets are distributed in the report.

## Results

- Existing catalogue: **489** entrypoints (214 EXE, 275 overlays).
- Additional candidates: **234** (102 embedded EXE level routines, 132 overlay routines).
- Combined inventory: **723 distinct image/segment/offset entries**, not 723 proven independent functions.
- Of the extra candidates, 98 are referenced by decoded level script callbacks, 16 by display API slots, and 120 by direct CALL instructions (mutually exclusive primary-evidence categories).
- 204 root display-API call sites map to the four driver alternatives. **57 other control-transfer sites** still require resolution/review in this scan; these are sites, not 57 missing functions.
- No decoding failures or instruction-boundary conflicts were found on the paths this scan visited. This does not prove unreachable code is absent.

| Image | Catalogued | Extra candidates | Combined | Unresolved transfer sites |
| --- | ---: | ---: | ---: | ---: |
| ADLIB | 8 | 4 | 12 | 1 |
| BUZZER | 8 | 0 | 8 | 0 |
| CGA | 56 | 27 | 83 | 4 |
| EGA | 54 | 31 | 85 | 4 |
| GENERAL | 4 | 0 | 4 | 0 |
| LEVEL1 | 3 | 0 | 3 | 0 |
| LEVEL2 | 3 | 0 | 3 | 0 |
| LEVEL3 | 3 | 0 | 3 | 0 |
| LEVEL4 | 3 | 0 | 3 | 0 |
| LEVEL5 | 3 | 0 | 3 | 0 |
| OCEAN | 3 | 0 | 3 | 0 |
| PICTURES | 4 | 0 | 4 | 0 |
| ROLAND | 8 | 7 | 15 | 1 |
| SIMPSONS | 214 | 102 | 316 | 40 |
| STARTUP | 3 | 0 | 3 | 0 |
| TGA | 56 | 26 | 82 | 3 |
| VGA | 56 | 37 | 93 | 4 |

The 102 extra EXE entries are in level 2 (30), level 3 (33), level 4 (36), and level 5 (3). Some are already known in older research or the asset decoder; “extra” means absent from the consolidated function catalogue, not newly reverse-engineered behavior.

## Counting rules and evidence

1. Count each physical image and segment/offset once. Multiple API aliases for one target count once.
2. Keep copies in different display drivers separate. No claim of semantic deduplication is made.
3. Seed traversal from the catalogue, all 64 display API slots, decoded native operands in all five exported level scripts, and documented internal labels.
4. Follow x86-16 direct branches and direct CALLs with Capstone. A CALL target adds a candidate; a branch target does not automatically add a function.
5. Preserve indirect calls/jumps and relocation-dependent FAR calls as review items. Do not scan arbitrary graphics/data for plausible prologues.
6. Exclude the 55 catalogued internal labels and five quarantined false detections from new function candidates.
7. Hash each of the 17 inputs so the result can be tied to the exact local DOS release.

The supplied V10 detected-function TSV contains 219 rows: 214 match the catalogue, four are quarantined false detections, and one is an internal continuation. Thus the apparent completeness of that TSV cannot establish completeness of all embedded levels or overlays. A fifth quarantined address is recorded in the catalogue but not that TSV.

## Reproduce

Run from the repository, with locally unpacked images and previously exported level JSON:

```powershell
python -m pip install capstone==5.0.7
python tools/audit-dos-functions.py --images C:/path/to/UNPACKED --research "C:/path/to/Ghidra scripts" --output obj/dos-function-audit.json
```

The checked-in [JSON snapshot](DOS_FUNCTION_INVENTORY.json) contains every address, evidence source, API slot, image hash, direct-call edge and unresolved transfer. The script is read-only with respect to original files; it writes only its requested output.

## What still prevents an exact total

- Validate boundaries and purpose of the 234 candidates, including shared tails and tiny return stubs.
- Resolve dispatch tables, dynamically patched pointers and callback/interrupt roots; repeat traversal after adding those roots.
- Check executable regions not reached by the current seed set. Shared code/data and self-modification need special handling.
- Compare against a fresh Ghidra analysis per image and targeted DOS execution traces. The older overlay registration scripts alone do not supply that validation.
- Maintain a separate implementation/fidelity inventory. These counts say nothing by themselves about TypeScript completeness.

**Do not use 489/723 as the percentage of the game understood:** the numerator is inherited catalogue coverage and the denominator includes candidates while potentially missing undiscovered routines.
