# ScriptVM: how objects execute DOS scripts

[Documentation home](../README.md) · [Assets](../assets/README.md) · [Level events](../levels/README.md)

A walking character, a falling object and a story sequence can all be driven by the same small interpreter. Their scripts select frames, set movement, wait, spawn children, play sounds and branch. Special routines are only needed when a script calls native DOS code.

## 1. Original encoding

These are **direct-threaded scripts**, not JavaScript and not ordinary x86 instruction streams. A script word identifies a DOS handler address; that handler determines the size and interpretation of the following arguments. Words are usually little-endian. A FAR native call carries a segment and offset.

The extractor decodes instructions into `object_scripts.json`, preserving PCs, names, sizes, arguments and control-flow edges. A PC is an original script address, not an array index. `nextPc = pc + size` advances past the arguments; a branch supplies a different PC.

An executable VM handler and the script data that points to it are different things. Counting scripts or every branch destination as DOS functions would overcount the executable.

## 2. Execution state

Each live object carries its type, script PC, delay, VM status, motion, animation and source/parent links. [ScriptVm.ts](../../src/game/ScriptVm.ts) executes instructions until it yields, despawns or blocks. It does not draw pixels or own the browser animation loop.

[RuntimeWorld.ts](../../src/game/RuntimeWorld.ts) coordinates streaming, script execution, movement, animation, collision and the rest of the game. Drawing reads the resulting state separately.

| State | Meaning |
| --- | --- |
| Running | Instructions can be executed |
| Waiting | A delay, condition or resource prevents further progress this update |
| Blocked | Missing instruction/native support or exhausted safety budget; inspect the reason |
| Inactive | The object slot is no longer live |

A default limit of 512 instructions per invocation prevents an unyielding loop from freezing the browser. Reaching it blocks with an explicit diagnostic; it does not pretend the sequence completed.

## 3. Waits and movement

`Wait` stores the argument in the 16-bit script-delay field, advances the PC and yields. The world decrements the delay using DOS signed/wrapping semantics. A wait value of zero still yields; it is not “continue immediately”. This explains the extra interval seen in original delay conventions.

`WaitUntilYAtLeast` yields until the object's Y coordinate reaches the threshold. Position continues to be updated by the world while the script waits. Velocity and acceleration use signed 8.8 fixed point: 0200h means +2 pixels per update, FE00h means -2.

A conceptual sequence (pseudocode, not an extracted game script):

```text
SetAnimation walkingFrames
SetVelocityX +2 pixels/update
Wait 19
StopMotion
PlaySound effectId
Despawn
```

The sprite moves during the wait. Animation and movement are runtime state, not a new script instruction executed for each pixel.

## 4. Main instruction families

| Family | Representative instructions | Effect |
| --- | --- | --- |
| Timing/control | Wait, Goto, GotoIfXAtOrRightOfBart | Yield or change execution path |
| Appearance | SetAnimation, SetStaticFrame | Set descriptor/animation state |
| Motion | SetVelocityX/Y, SetAccelerationX/Y, StopMotion | Configure world integration |
| Object lifetime | SpawnChild, SpawnChildAfterCurrent, Despawn | Allocate/release slots |
| Persistence | DetachSource, SetSourceTypeFlags, SetTypeAndPersistY | Change placement-backed state |
| Gameplay | DecrementObjectiveCounterBCD, SetGlobalEventData, PlaySound | Call world services |
| Special handling | CallNativeFar, ExternalSpecial3Bytes, SetLevelCameraState | Delegate recovered external behavior |

This is a guide to the implemented families, not proof that all script/native semantics are complete. The switch in ScriptVm is the executable definition.

## 5. Sources, slots and children

A **source** is a persistent level placement record. A **slot** is a currently active object. There are 28 ordinary slots. Camera streaming can release a slot while retaining changes in its source, so returning to an area does not necessarily recreate the original object.

`SpawnChild` searches the full pool. If no slot is free, it retries the same instruction on a later update. `SpawnChildAfterCurrent` searches only after the parent and follows the recovered skip behavior on allocation failure. Children keep a parent link and supplied offsets/flags.

Reserved player projectiles use a separate action slot. Rockets and bombs now run exported scripts there; they do not consume one of the 28 ordinary slots.

See [object pool details](../OBJECT_POOL_AND_STORY_VM.md) for the uncommon source gate that is still approximated.

## 6. Native calls and level ownership

A native call is original x86 code reached by a script. The browser does not execute it as x86. It routes the original address to a typed implementation through the level-handler registry.

Level 1 implements its recovered callbacks in [Level1NativeHandlers.ts](../../src/game/levels/level1/Level1NativeHandlers.ts). Levels 2–5 currently use the empty handler set; some of their script paths therefore block. Do not replace an unknown native with a silent no-op just to make the animation continue.

For example, the cinema controller's callback checks the timer; the ordinary script then spawns the passer-by. The native decides the branch, while the VM still owns the resulting script.

## 7. Debugging a sequence

1. Select the object in the viewer.
2. Read its type, source index and original script PC.
3. Inspect instruction visits, last outcomes and wait origin/resume information.
4. If blocked, identify the missing instruction or native segment:offset.
5. Compare the decoded flow with the original listing before changing semantics.
6. Add a regression for the trigger, intermediate state and lasting result.

An object can have a valid script but no visible frame, or correct graphics but an unsupported native. Treat these as separate issues.

## 8. Tests and known limits

Run `npm run smoke` with local assets. The runtime and story tests cover execution across all five exported levels, spawning, payphone/Moe, reserved projectile scripts and Level-1 event chains. Some tests intentionally use teleporting, item grants or invulnerability to isolate mechanics.

The VM trace is not a full CPU trace. Unsupported natives, some source gates and common-overlay rendering remain incomplete. Exact presentation, RNG/timing and complete ordinary level routes need independent DOS comparisons.

[Function catalogue: script handlers](../DOS_FUNCTION_CATALOG.md#script_vm) · [Typed level lifecycle](../LEVEL_HANDLERS.md)
