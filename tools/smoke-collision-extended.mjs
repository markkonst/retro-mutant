import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const noInput = () => ({ left: false, right: false, jump: false });

function loadLevel(levelNumber, { withoutTerrain = false } = {}) {
  const dataRoot = join(root, "wwwroot", "data", `level${levelNumber}`);
  const manifest = JSON.parse(readFileSync(join(dataRoot, "manifest.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(join(dataRoot, "runtime_data.json"), "utf8"));
  if (withoutTerrain) runtime.static_terrain = [];
  const scripts = JSON.parse(readFileSync(join(dataRoot, "object_scripts.json"), "utf8"));
  const playerConfig = JSON.parse(readFileSync(join(dataRoot, "player_runtime.json"), "utf8"));
  return {
    level: levelNumber,
    manifest,
    runtime,
    scripts,
    playerConfig,
    background: {},
    descriptorByIndex: new Map(manifest.runtime.object_descriptors.map((d) => [d.index, d])),
    imageByDescriptorIndex: new Map(),
    bartDescriptorByIndex: new Map(manifest.runtime.bart_descriptors.map((d) => [d.index, d])),
    bartImageByDescriptorIndex: new Map(),
    flowByType: new Map(scripts.object_types.map((f) => [f.type_id, f])),
    collisionByType: new Map(runtime.collision_profiles.map((c) => [c.type_id, c])),
  };
}

function isolateHandler(levelNumber, handlerIndex) {
  const level = loadLevel(levelNumber, { withoutTerrain: true });
  const world = new RuntimeWorld(level);
  let object = world.objects.find((candidate) => candidate.collision?.collision_index === handlerIndex);
  if (!object) {
    // Some collision types are transition-only and do not occur as initial sources.
    const profile = level.runtime.collision_profiles.find((candidate) => candidate.collision_index === handlerIndex);
    if (!profile) throw new Error(`L${levelNumber}: no profile using handler ${handlerIndex}`);
    const flow = level.flowByType.get(profile.type_id);
    if (!flow) throw new Error(`L${levelNumber}: no flow for transition-only handler ${handlerIndex} type ${profile.type_id}`);
    object = world.objects[0];
    object.typeId = profile.type_id;
    object.typeOffset = profile.type_id * 2;
    object.flow = flow;
    object.collision = profile;
    object.scriptPC = flow.entry_offset;
  }
  if (!object.collision) throw new Error(`L${levelNumber}: handler ${handlerIndex} object has no profile`);
  for (const candidate of world.objects) candidate.active = candidate === object;
  object.vmState = "blocked";
  object.velocityX = object.velocityY = object.accelerationX = object.accelerationY = 0;
  object.x = world.bart.x;
  object.y = world.bart.y;
  return { level, world, object };
}

// Handler 1 with a negative even transition: DOS transition path, score/goal side effect, no Bart damage.
{
  const level = loadLevel(1, { withoutTerrain: true });
  const world = new RuntimeWorld(level);
  const source = level.runtime.object_sources.find((candidate) => candidate.type_id === 30);
  const object = source ? world.debugEnsureSourceLoaded(source.index) : null;
  if (!object?.collision || object.collision.collision_index !== 1 || object.collision.parameter !== -62) {
    throw new Error("L1 type 30 handler-1 signed transition fixture missing");
  }
  for (const candidate of world.objects) candidate.active = candidate === object;
  object.vmState = "blocked";
  object.x = world.bart.x;
  object.y = world.bart.y;
  const goals = world.hud.goalsRemaining;
  world.tick(noInput());
  if (object.typeOffset !== 62 || object.typeId !== 31 || world.bart.hitDeathTimer !== 0) {
    throw new Error(`Handler 1 transition/damage split failed: type=${object.typeId}/${object.typeOffset} hit=${world.bart.hitDeathTimer}`);
  }
  if (world.hud.score !== 100 || world.hud.goalsRemaining !== goals - 1) {
    throw new Error(`Handler 1 negative transition side effects failed: score=${world.hud.score} goals=${world.hud.goalsRemaining}`);
  }
}

// Handler 15 is NOT Bart body AABB. Without the action/weapon hitbox it must do nothing.
{
  const level = loadLevel(1, { withoutTerrain: true });
  const world = new RuntimeWorld(level);
  const object = world.getObjectBySourceIndex(0);
  if (!object?.collision || object.typeId !== 15 || object.collision.collision_index !== 15) throw new Error("L1 source #0 handler-15 fixture missing");
  for (const candidate of world.objects) candidate.active = candidate === object;
  object.vmState = "blocked";
  world.bart.x = object.x;
  world.bart.y = object.y;
  world.bart.groundY = object.y;
  world.bart.supportY = object.y;
  world.bart.supportKind = "ground";
  world.bart.airborne = false;
  const collisionsBefore = world.bart.collisionCount;
  world.tick(noInput());
  if (world.bart.hitDeathTimer !== 0 || world.bart.collisionCount !== collisionsBefore) {
    throw new Error(`Handler 15 incorrectly used Bart body AABB: hit=${world.bart.hitDeathTimer} collisions=${world.bart.collisionCount}`);
  }
}

// Handler 29 delegates to handler 1 only when low byte of GameObject+2C is zero.
{
  const { world, object } = isolateHandler(4, 29);
  object.motionReferenceX = 1;
  world.tick(noInput());
  if (world.bart.hitDeathTimer !== 0) throw new Error("Handler 29 ignored non-zero +2C gate");
  object.motionReferenceX = 0;
  world.tick(noInput());
  if (world.bart.hitDeathTimer !== 0x32) throw new Error(`Handler 29 zero +2C did not enter handler 1: ${world.bart.hitDeathTimer}`);
}

// Handler 30: only at progress 0Fh, latch clear and counter != 4; increments 0780 and sets 0784=FFh.
{
  const { world } = isolateHandler(5, 30);
  world.collisionState.levelProgress0766 = 0x0f;
  world.collisionState.specialCounter0780 = 2;
  world.collisionState.collisionLatch0784 = 0;
  world.tick(noInput());
  if (world.collisionState.specialCounter0780 !== 3 || world.collisionState.collisionLatch0784 !== 0xff) {
    throw new Error(`Handler 30 state failed: 0780=${world.collisionState.specialCounter0780} 0784=${world.collisionState.collisionLatch0784}`);
  }
}

// Handler 31: airborne + low-nibble pattern match advances 0768 by two and applies profile transition.
{
  const { world, object } = isolateHandler(4, 31);
  world.bart.y = world.bart.groundY - 20;
  object.y = world.bart.y;
  world.bart.airborne = true;
  world.bart.supportKind = "none";
  world.bart.velocityY = 0;
  object.flags = (object.flags & 0xfff0) | 2; // pattern[0]
  world.collisionState.patternState0768 = 0;
  const transition = object.collision.parameter;
  world.tick(noInput());
  if (world.collisionState.patternState0768 !== 2 || object.typeOffset !== transition) {
    throw new Error(`Handler 31 pattern transition failed: state=${world.collisionState.patternState0768} typeOffset=${object.typeOffset} expected=${transition}`);
  }
}

// Handler 32: score 50, 076A += 4, consume object.
{
  const { world, object } = isolateHandler(4, 32);
  world.collisionState.sequenceCounter076A = 0;
  world.tick(noInput());
  if (world.collisionState.sequenceCounter076A !== 4 || world.hud.score !== 50 || object.active) {
    throw new Error(`Handler 32 failed: 076A=${world.collisionState.sequenceCounter076A} score=${world.hud.score} active=${object.active}`);
  }
}

// Handler 34: unlike the terrain spring, subtracts 0100h from current vertical speed (up to the -5.0 threshold).
{
  const { world, object } = isolateHandler(3, 34);
  // Place the tall -80..+70 profile over Bart after normal motion integration.
  object.y = world.bart.y + 80;
  world.bart.airborne = true;
  world.bart.supportKind = "none";
  world.bart.velocityY = 0;
  world.tick(noInput());
  if (!world.bart.airborne || world.bart.velocityY >= 0) {
    throw new Error(`Handler 34 bounce failed: airborne=${world.bart.airborne} vy=${world.bart.velocityY}`);
  }
}

console.log("Extended collision smoke: handlers 1,15,29,30,31,32,34 DOS-specific branches OK");
