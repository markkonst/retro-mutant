# Level 1: cinema, Jebediah and Maggie

[Level-1 overview](levels/level1/README.md) · [All levels](levels/README.md)

This audit follows the supported local DOS release. Tests isolate the event
chains by positioning Bart and granting items; they are not a full route replay.
No mechanics from other ports have been substituted for missing DOS evidence.

## Maggie: activation recovered and implemented

Root `2F4B..2F60` indexes the helper-letter record at DS:06A3 by level * 16.
For level 1 it contains six letters. `6817..6894` consumes a type-6 token,
awards 100 points, queues sound 8 and advances **07AF**, bounded by **07B1**.
This is not the unrelated progress counter 0766 and does not decrement purple goals.
On the sixth token it writes 8000h to the source addressed by DS:08DE/08E0,
which comes from LevelRuntimeConfig +70h: **096D:06C5, source #124, type 84**.

The original type-84 script spawns type 85, Maggie's ball, every cycle. Airborne
Bart contact (handler 8) changes it to type 86. Its original flight script then
hits Nelson through handler 14 for three HP. The runtime now connects token
collection to that source, keeping the ordinary streaming and original scripts.
The HUD displays collected MAGGIE letters; their layout uses the viewer's DOS
font and is a reconstruction, not the original common-overlay letter graphics.

The regression defeats six original aliens, waits for each original death script
to create a token, collects them, checks the disabled/enabled source boundary,
then runs Maggie's ball through its actual transition and Nelson hit. Reset
clears the letter count and restores Maggie's initially disabled source.

## Cinema: timed sprayable passer-by, not a proven cinema visit

Source #3/type 90 at X=368 calls `096D:3165`. At timer values 400 or 200 it
spawns type 91. That character comes out, moves left and can be sprayed:
handler 15's signed transition -184 selects type 92, decrements one purple goal,
and starts its original angry-character animation and movement.

Both time gates and complete spray transitions pass the regression. The board
therefore corresponds to a working timed gameplay event. No separate entrance,
interior or bonus show was found in the examined level scripts or the level-1
player dispatch (`38EC..3A19`); that dispatch enters only the three documented
shops. Absence of an additional feature is not proven by this bounded audit.
No invented cinema interior has been added.

## Jebediah: rocket, bird and original AHEAD message

Source #52/type 27 at X=3372,Y=28 is the purple bird on the background statue,
not a detachable head sprite. Original descriptor 162 confirms the bird.
A rocket explosion uses handler 17 and signed transition -58 to select type 29
and decrement a purple goal. The `096D:218C` script animates bird frames
163..166, sets global message `096D:170B`, flies left/up, detaches the persistent
source and disappears. The message includes GOOD JOB, YOUNG SIMPSON! and the
original AHEAD hint. The existing viewer previously exposed it only in debug
status; it now appears on the game canvas for the FAh message lifetime.

The message box is a readable reconstruction: original text, trigger and lifetime
are preserved, but the common-overlay typewriter/blitter and movement-lock
presentation are not claimed exact. The regression checks the rocket hit,
goal decrement, message pointer/content and permanent source removal.

A separate head-jumping reward remains unproven. In the inspected export there
is no statue-head landing terrain: source #51 is a separate hidden coin trigger,
and source #52 is the rocket/bird interaction above. The AHEAD text is a clue,
not sufficient evidence to invent a life reward, landing platform or head removal.

## Reproduce

Re-export level assets after updating: player_runtime.json now includes
helper_token_count and helper_source_offset, read from the EXE. Then run:

```powershell
npm run smoke
```

The targeted regression is tools/smoke-level1-secrets.mjs. Collision handler 6
retains partial fidelity because the original helper-letter HUD graphics remain
approximate, despite its recovered activation path now being implemented.
