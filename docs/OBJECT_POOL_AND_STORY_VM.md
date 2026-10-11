# Object pool, story VM and live inspector — v0.9.0

## 28 runtime slots

The runtime now owns 28 fixed `GameObjectRuntime` slots, matching the recovered DOS pool size. Persistent level sources are mutable backing records; loading a source allocates a free slot and marks its source as loaded. Source-attached objects outside the gameplay streaming window can be released again, while transient children remain allocated until their own script/collision logic despawns them.

This milestone intentionally describes streaming as **DOS-style**, not bit-exact: the ordinary camera window and loaded/source flags are modeled, but the uncommon source `0x0100` load gate still lacks all of its original global prerequisites.

## Child objects

`SpawnChild` searches the full pool for a free slot. `SpawnChildAfterCurrent` searches only after the parent slot. Children inherit a parent-runtime link and use script-provided X/Y offsets, type and runtime flags. When ordinary `SpawnChild` cannot allocate, the parent VM retries from the same instruction on a later tick; the AfterCurrent variant follows the recovered skip behavior.

## Payphone / Moe validation

The Level-1 COIN item activates the dormant source record at X=736 (type 9). Its original script rings the phone, writes global event-message data, creates type-13/14 speech-bubble children, calls the recovered random prank-call branch native, and eventually creates type-11 Moe. Moe then runs his own original animation/motion/wait/despawn script.

No Moe-specific storyboard is hardcoded in the runtime: the scene is a regression case for generic source activation, VM state, child allocation, event data and native callbacks.

The original dialogue strings are decoded from the embedded Level-1 data. Bubble text placement is reconstructed with the original DOS 8x8 font and is not yet claimed to match the original platform blitter pixel-for-pixel.

## Live VM inspector

Selecting an active object shows its complete decoded script and runtime execution state. Per instruction the UI shows status, PC, decoded operands, visit count, most recent tick and last outcome/detail. Separate wait and branch summaries expose wait-origin/resume PCs, countdown/condition state and native/branch target decisions. A rolling history keeps the most recent VM steps for the selected runtime object.
