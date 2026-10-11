import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
function loadLevel(levelNumber) {
  const dataRoot = join(root, "wwwroot", "data", `level${levelNumber}`);
  const manifest = JSON.parse(readFileSync(join(dataRoot, "manifest.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(join(dataRoot, "runtime_data.json"), "utf8"));
  const scripts = JSON.parse(readFileSync(join(dataRoot, "object_scripts.json"), "utf8"));
  const playerConfig = JSON.parse(readFileSync(join(dataRoot, "player_runtime.json"), "utf8"));
  const eventMessages = JSON.parse(readFileSync(join(dataRoot, "event_messages.json"), "utf8"));
  return {
    level: levelNumber, manifest, runtime, scripts, playerConfig, eventMessages, background: {},
    descriptorByIndex: new Map(manifest.runtime.object_descriptors.map((d) => [d.index, d])), imageByDescriptorIndex: new Map(),
    bartDescriptorByIndex: new Map(manifest.runtime.bart_descriptors.map((d) => [d.index, d])), bartImageByDescriptorIndex: new Map(),
    flowByType: new Map(scripts.object_types.map((f) => [f.type_id, f])),
    collisionByType: new Map(runtime.collision_profiles.map((c) => [c.type_id, c])),
    eventMessageByKey: new Map(eventMessages.messages.map((m) => [`${m.segment}:${m.offset}`, m])),
  };
}
const no = { left:false,right:false,jump:false,action:false,inventory:false };
const world = new RuntimeWorld(loadLevel(1));
world.setCollisionsEnabled(false);
if (world.objects.length !== 28 || world.objects.some((o, i) => o.slotIndex !== i || o.runtimeId !== i)) {
  throw new Error("DOS runtime pool is not exactly 28 fixed slots");
}
const payphoneSource = world.getSourceStateByOffset(world.level.playerConfig.progress_source_offset);
if (!payphoneSource || payphoneSource.index !== 10 || payphoneSource.type_id !== 9 || (payphoneSource.flags & 0x8000) !== 0) {
  throw new Error(`Payphone source fixture changed: ${JSON.stringify(payphoneSource)}`);
}
// Use the real COIN inventory trigger at the recovered payphone interaction coordinate.
world.bart.x = 0x348;
world.bart.y = 0x62;
world.collisionState.inventory.selectedItem = 2;
world.tick({ ...no, inventory:true });
world.tick(no);
if ((payphoneSource.flags & 0x8000) === 0 || world.collisionState.inventoryCounts[2] !== 0x09) {
  throw new Error(`COIN did not activate payphone source: flags=${payphoneSource.flags.toString(16)} coin=${world.collisionState.inventoryCounts[2].toString(16)}`);
}
let phone = world.getObjectBySourceIndex(10);
if (!phone || phone.typeId !== 9) throw new Error("Activated payphone did not stream into the 28-slot pool");

let bubble = null;
for (let i = 0; i < 400 && !bubble; i++) {
  world.tick(no);
  bubble = world.objects.find((o) => o.active && (o.typeId === 13 || o.typeId === 14) && o.eventTextSnapshot?.length) ?? null;
}
if (!bubble) throw new Error(`First Moe speech bubble never spawned; phone PC=${phone.scriptPC.toString(16)} ${phone.vmState}/${phone.vmMessage}`);
if (bubble.parentRuntimeId !== phone.runtimeId) throw new Error(`SpawnChild parent link wrong: child=${bubble.parentRuntimeId} phone=${phone.runtimeId}`);
if (bubble.eventTextSnapshot.join("|") !== "MOE'S TAVERN.|MOE SPEAKING.") throw new Error(`Wrong first event text: ${bubble.eventTextSnapshot.join("|")}`);
if (phone.vmWait?.originPc !== 0x24a8 || phone.vmWait.resumePc !== 0x24ac || phone.vmWait.reason !== "delay") {
  throw new Error(`VM wait tracking wrong at first bubble: ${JSON.stringify(phone.vmWait)}`);
}
const spawnState = phone.vmInstructionStates.get(0x249e);
if (!spawnState || spawnState.visits !== 1 || spawnState.lastOutcome !== "spawned") throw new Error("SpawnChild VM trace missing");

let moe = null;
for (let i = 0; i < 1800 && !moe; i++) {
  world.tick(no);
  moe = world.objects.find((o) => o.active && o.typeId === 11) ?? null;
}
if (!moe) throw new Error(`Moe never spawned; phone PC=${phone.scriptPC.toString(16)} ${phone.vmState}/${phone.vmMessage}`);
if (moe.parentRuntimeId !== phone.runtimeId || moe.velocityX !== 0x0140 || (moe.runtimeFlags & 0x80) === 0) {
  throw new Error(`Moe child runtime wrong: parent=${moe.parentRuntimeId} vx=${moe.velocityX} rf=${moe.runtimeFlags.toString(16)}`);
}
const randomHistory = phone.vmHistory.find((h) => h.pc === 0x24ac && h.outcome === "branch-taken");
if (!randomHistory || !randomHistory.detail?.includes("random&7=")) throw new Error("Random prank-call native branch is not present in VM history");
if (!phone.vmInstructionStates.get(0x24ac)?.visits) throw new Error("Native branch visit counter missing");
if (phone.vmState === "blocked") throw new Error(`Phone VM blocked unexpectedly: ${phone.vmMessage}`);
console.log(`Story/VM smoke: 28-slot pool, COIN->payphone, SetGlobalEventData, speech SpawnChild, random prank branch and Moe spawn OK (tick ${world.tickCount})`);
