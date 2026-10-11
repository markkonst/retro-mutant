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
  const objectImages = new Map(manifest.runtime.object_descriptors.map((d) => [d.index, { bank: "object", index: d.index }]));
  const bartImages = new Map(manifest.runtime.bart_descriptors.map((d) => [d.index, { bank: "bart", index: d.index }]));
  return {
    level: levelNumber,
    manifest,
    runtime,
    scripts,
    playerConfig,
    background: {},
    descriptorByIndex: new Map(manifest.runtime.object_descriptors.map((d) => [d.index, d])),
    imageByDescriptorIndex: objectImages,
    bartDescriptorByIndex: new Map(manifest.runtime.bart_descriptors.map((d) => [d.index, d])),
    bartImageByDescriptorIndex: bartImages,
    flowByType: new Map(scripts.object_types.map((f) => [f.type_id, f])),
    collisionByType: new Map(runtime.collision_profiles.map((c) => [c.type_id, c])),
  };
}

const expected = new Map([
  [1, new Map([[15, 117], [16, 116], [17, 119], [18, 118]])],
  [2, new Map([[97, 25], [98, 26]])],
  [5, new Map([[33, 25], [34, 26], [35, 27]])],
]);

for (const [levelNumber, byType] of expected) {
  for (const [typeId, descriptorId] of byType) {
    const level = loadLevel(levelNumber);
    const world = new RuntimeWorld(level);
    world.setCollisionsEnabled(false);
    const flow = level.flowByType.get(typeId);
    if (!flow) throw new Error(`L${levelNumber}: missing special static flow type ${typeId}`);

    // Some of these helper types are only reached through a collision/script
    // transition and therefore have no initial LevelObjectSource record. Reuse
    // a runtime slot and enter the target script exactly as a type transition
    // would, so the VM + descriptor resolver are both exercised.
    const object = world.objects[0];
    object.typeId = typeId;
    object.typeOffset = typeId * 2;
    object.flow = flow;
    object.collision = level.collisionByType.get(typeId) ?? null;
    object.scriptPC = flow.entry_offset;
    object.scriptDelay = 0;
    object.vmState = "ready";
    object.animFrameCount = 0;
    object.descriptorBank = null;
    object.descriptorIndex = null;
    object.descriptor = null;
    object.image = null;

    world.tick({ left: false, right: false, jump: false });
    if (object.descriptorBank !== "bart" || object.descriptorIndex !== descriptorId) {
      throw new Error(`L${levelNumber} T${typeId}: expected Bart/common #${descriptorId}, got ${object.descriptorBank} #${object.descriptorIndex}`);
    }
    if (!object.descriptor || object.image?.bank !== "bart" || object.image?.index !== descriptorId) {
      throw new Error(`L${levelNumber} T${typeId}: Bart/common descriptor/image did not resolve`);
    }
  }
}

// The specific visible regression that motivated this change.
{
  const world = new RuntimeWorld(loadLevel(1));
  world.setCollisionsEnabled(false);
  world.tick({ left: false, right: false, jump: false });
  const source0 = world.getObjectBySourceIndex(0);
  if (!source0 || source0.typeId !== 15 || source0.x !== 88 || source0.descriptorBank !== "bart" || source0.descriptorIndex !== 117) {
    throw new Error(`Level-1 source #0 regression: ${JSON.stringify(source0 && { typeId: source0.typeId, x: source0.x, bank: source0.descriptorBank, descriptor: source0.descriptorIndex })}`);
  }
}

console.log("Special static-frame smoke: L1 street object + L1/L2/L5 Bart/common-bank frames OK");
