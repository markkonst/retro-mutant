# Ghidra runtime reference used by v0.6

This project was built against the current Ghidra listing supplied on 2026-08-31.

## Object update sequence

Core offsets in `SIMPSONS.EXE`:

```text
5AAC  scriptDelay -= 1
5AB1  load scriptDelay
5AB7  if signed >= 0 -> skip VM
5AB9  RunObjectScriptVM
5AD9  velocityX += accelerationX
...   fixed-point X integration
5B00  velocityY += accelerationY
...   fixed-point Y integration
5B27  load animFrame
5B2B  animTimer -= 1
5B30  if animTimer != 0 -> keep frame
5B32  animTimer = animReload
5B3A  frame += 1
5B3D  compare frame with animFrameCount
5B43  wrap frame to 0
5B45  store animFrame
5B49..5B53  frame*12 + animBase
5B69  store renderOffset
```

## SetAnimation

```text
5BA6  animBase       = word[SI+0]
5BAC  animFrameCount = word[SI+2]
5BB3  animTimer      = word[SI+4]
5BBA  animReload     = word[SI+4]
5BC1  animFrame      = 0
```

## SetStaticFrame

```text
5BCA  animBase       = word[SI]
5BCF  store animBase
5BD3  animFrameCount = 1
5BD9  animTimer      = 1
5BDF  animReload     = FFFFh
5BE5  animFrame      = 0
```

The TypeScript runtime deliberately keeps logical tick semantics separate from wall-clock pacing. The UI's 10/18.2/20/30/60 Hz selector is only a debugging playback speed until the exact original game/display pacing is established.

## v0.5 Bart damage / blink / HUD state

Recovered root-EXE state used by v0.5:

```text
076F  g_LivesRemaining        initialized to 03h at game start
0770  g_BartHealthCounter     initialized to 01h by ResetBartAndGameplayState
0771  g_GoalsRemainingBCD     initialized from LevelRuntimeConfig +0Eh
083B  Bart hit/death timer    damage handlers set 32h
083C  Bart blink phase        BeginBartHitInvulnerability sets 00h
083D  Bart invulnerability    BeginBartHitInvulnerability sets 64h
```

`BuildBartRenderObject` performs the blink gate:

```text
if 083D != 0:
    083D--
    083C = (083C + 1) & 7
    if (083C & 4) != 0:
        omit Bart render object
```

`HandleBartHitDeathAndRespawn` decrements `083B`. When it reaches zero it decrements `0770`; a non-negative result resumes gameplay, while a negative result enters the life-loss path and decrements `076F` before respawn/game-over.

Common HUD fields in `UpdateHudStatusFields` are ordered as goals (`0771`), timer (`0760`), lives (`076F`) and six-digit packed-BCD score (`0762/0764`). v0.5 keeps a modern numeric runtime representation but preserves the recovered initialization and event semantics.

## v0.6 collision dispatch and special static frames

`ProcessBartObjectCollisions` builds Bart's body rectangle at `5F09..5F1D`, scans the runtime pool, derives the 12-byte collision profile from `typeOffset`, reads the profile's handler index and dispatches through the 43-entry near jump table at `5F67`. The TypeScript `CollisionSystem.handlers` array is kept index-for-index with that table; see `COLLISION_HANDLER_MATRIX.md`.

Handlers that use DS:0E87 (Bart action object), DS:089A / DS:079D (secondary hitbox + linked target), or external record pointers are not substituted with Bart's normal body AABB. They remain explicit deferred entries until the producer state is implemented.

The special static-frame scripts are a separate render-bank case. Normal object animation bases are 12-byte descriptor offsets, but the recovered unaligned `SetStaticFrame` values are direct descriptor IDs in the Bart/common bank. The cross-level families are L1 `117/116/119/118`, L2 `25/26`, and L5 `25/26/27`; this is now tracked by `GameObjectRuntime.descriptorBank`.
