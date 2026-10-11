import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { CollisionSystem } from "../wwwroot/js/game/CollisionSystem.js";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));

function loadLevel(levelNumber) {
  const dataRoot = join(root, "wwwroot", "data", `level${levelNumber}`);
  const manifest = JSON.parse(readFileSync(join(dataRoot, "manifest.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(join(dataRoot, "runtime_data.json"), "utf8"));
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

function deactivateObjects(world) {
  for (const object of world.objects) object.active = false;
}

// Static terrain: Level 1 has a normal surface x=584..647, surfaceY=96 => BartY=66.
{
  const world = new RuntimeWorld(loadLevel(1));
  deactivateObjects(world);
  Object.assign(world.bart, {
    x: 590,
    y: 55,
    airborne: true,
    supportKind: "none",
    supportSourceIndex: null,
    velocityY: 0x0200,
  });
  for (let i = 0; i < 16 && world.bart.airborne; i++) world.tick({ left: false, right: false, jump: false });
  if (world.bart.y !== 66 || world.bart.supportKind !== "terrain") {
    throw new Error(`Static terrain landing failed: Y=${world.bart.y} support=${world.bart.supportKind}`);
  }
}

// Static spring: Level 1 terrain #0 spans x=88..103, surfaceY=126 => contact BartY=96.
{
  const world = new RuntimeWorld(loadLevel(1));
  deactivateObjects(world);
  Object.assign(world.bart, {
    x: 80,
    y: 90,
    airborne: true,
    supportKind: "none",
    supportSourceIndex: null,
    velocityY: 0x0200,
  });
  for (let i = 0; i < 8; i++) {
    world.tick({ left: false, right: false, jump: false });
    if (world.bart.lastCollision?.includes("terrain spring")) break;
  }
  if (!world.bart.airborne || world.bart.velocityY >= 0 || world.bart.y !== 96) {
    throw new Error(`Terrain spring failed: Y=${world.bart.y} Vy=${world.bart.velocityY}`);
  }
}

// Horizontal solid: exercise handler 10 with an actual exported profile.
{
  const level = loadLevel(1);
  const world = new RuntimeWorld(level);
  const solidSource = level.runtime.object_sources.find((s) => level.collisionByType.get(s.type_id)?.collision_index === 10);
  const solid = solidSource ? world.debugEnsureSourceLoaded(solidSource.index) : null;
  if (!solid?.collision) throw new Error("No Level-1 handler-10 object found");
  deactivateObjects(world);
  solid.active = true;
  solid.vmState = "blocked";
  solid.x = 100 - solid.collision.x_offset;
  solid.y = 100 - solid.collision.y_offset;
  Object.assign(world.bart, { x: 88, y: 100, velocityX: 0x0200, velocityY: 0, airborne: false });
  const collision = new CollisionSystem(level, world.bartPlayer);
  collision.resolveObjectCollisions({ x: 85, y: 100 }, new Map([[solid.runtimeId, { x: solid.x, y: solid.y }]]), world.objects);
  if (world.bart.x !== 86 || world.bart.velocityX !== 0) {
    throw new Error(`Horizontal solid failed: X=${world.bart.x} Vx=${world.bart.velocityX}`);
  }
}

// One-way platform: handler 11 snaps BartY directly to objectY + profile.yOffset.
{
  const level = loadLevel(2);
  const world = new RuntimeWorld(level);
  const platformSource = level.runtime.object_sources.find((s) => level.collisionByType.get(s.type_id)?.collision_index === 11);
  const platform = platformSource ? world.debugEnsureSourceLoaded(platformSource.index) : null;
  if (!platform?.collision) throw new Error("No Level-2 handler-11 object found");
  deactivateObjects(world);
  platform.active = true;
  platform.vmState = "blocked";
  // Handler 11 decrements the low-byte landing counter while coming down.
  // Starting at 2 proves that landing does not incorrectly transition immediately.
  platform.flags = (platform.flags & 0xff00) | 0x02;
  platform.x = 200 - platform.collision.x_offset;
  platform.y = 80 - platform.collision.y_offset;
  Object.assign(world.bart, {
    x: 198,
    y: 81,
    airborne: true,
    supportKind: "none",
    supportSourceIndex: null,
    velocityY: 0x0100,
  });
  const collision = new CollisionSystem(level, world.bartPlayer);
  collision.resolveObjectCollisions({ x: 198, y: 78 }, new Map([[platform.runtimeId, { x: platform.x, y: platform.y }]]), world.objects);
  if (world.bart.y !== 80 || world.bart.supportKind !== "object" || world.bart.supportSourceIndex !== platform.source.index) {
    throw new Error(`One-way platform failed: Y=${world.bart.y} support=${world.bart.supportKind}/${world.bart.supportSourceIndex}`);
  }
  if ((platform.flags & 0xff) !== 0x01) {
    throw new Error(`Handler-11 landing counter failed: lowFlags=${platform.flags & 0xff}`);
  }
}

// Handler 1: one hit starts the recovered 0x64 invulnerability timer; overlap during it must not retrigger damage.
{
  const level = loadLevel(1);
  const world = new RuntimeWorld(level);
  const hazardSource = level.runtime.object_sources.find((s) => { const c = level.collisionByType.get(s.type_id); return c?.collision_index === 1 && c.parameter === 0; });
  const hazard = hazardSource ? world.debugEnsureSourceLoaded(hazardSource.index) : null;
  if (!hazard?.collision) throw new Error("No Level-1 handler-1 object found");
  deactivateObjects(world);
  hazard.active = true;
  hazard.vmState = "blocked";
  hazard.x = 300 - hazard.collision.x_offset;
  hazard.y = 100 - hazard.collision.y_offset;
  Object.assign(world.bart, { x: 294, y: 96, hitDeathTimer: 0, invulnerabilityTimer: 0, blinkPhase: 0, renderVisible: true, collisionCount: 0 });
  const collision = new CollisionSystem(level, world.bartPlayer);
  const prev = new Map([[hazard.runtimeId, { x: hazard.x, y: hazard.y }]]);
  collision.resolveObjectCollisions({ x: world.bart.x, y: world.bart.y }, prev, world.objects);
  const firstCount = world.bart.collisionCount;
  if (world.bart.invulnerabilityTimer !== 0x64 || world.bart.hitDeathTimer !== 0x32 || firstCount !== 1) {
    throw new Error(`Hazard first hit failed: inv=${world.bart.invulnerabilityTimer} hit=${world.bart.hitDeathTimer} count=${firstCount}`);
  }
  collision.resolveObjectCollisions({ x: world.bart.x, y: world.bart.y }, prev, world.objects);
  if (world.bart.collisionCount !== firstCount) {
    throw new Error(`Invulnerability retriggered hazard: count=${world.bart.collisionCount}`);
  }
}

console.log("Collision smoke: terrain landing/spring, solid, one-way platform and hazard invulnerability OK");
