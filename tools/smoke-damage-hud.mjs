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

function noInput() {
  return { left: false, right: false, jump: false };
}

// Initial common HUD state recovered from game + level config.
{
  const world = new RuntimeWorld(loadLevel(1));
  world.setCollisionsEnabled(false);
  if (world.hud.livesRemaining !== 3 || world.healthPoints !== 2 || world.hud.score !== 0 || world.hud.levelTimer !== 999 || world.hud.goalsRemaining !== 24) {
    throw new Error(`Initial HUD mismatch: ${JSON.stringify(world.hud)} health=${world.healthPoints}`);
  }

  // DOS timer divider: first decrement after 1Eh=30 ticks, then every 23h=35.
  for (let i = 0; i < 29; i++) world.tick(noInput());
  if (world.hud.levelTimer !== 999) throw new Error(`Timer decremented too early: ${world.hud.levelTimer}`);
  world.tick(noInput());
  if (world.hud.levelTimer !== 998) throw new Error(`Timer first decrement failed: ${world.hud.levelTimer}`);
  for (let i = 0; i < 35; i++) world.tick(noInput());
  if (world.hud.levelTimer !== 997) throw new Error(`Timer recurring decrement failed: ${world.hud.levelTimer}`);
}

// Damage state: 50-tick hit/death countdown, then one health point, then blink.
{
  const world = new RuntimeWorld(loadLevel(1));
  world.setCollisionsEnabled(false);
  if (!world.bartPlayer.takeHit("smoke hit 1")) throw new Error("First hit was rejected");
  if (world.bart.hitDeathTimer !== 0x32 || world.bart.invulnerabilityTimer !== 0x64) throw new Error("Damage timers not initialized");

  for (let i = 0; i < 49; i++) world.tick(noInput());
  if (world.healthPoints !== 2 || world.bart.hitDeathTimer !== 1) throw new Error(`Health changed before hit countdown ended: hp=${world.healthPoints} hit=${world.bart.hitDeathTimer}`);
  world.tick(noInput());
  if (world.healthPoints !== 1 || world.hud.livesRemaining !== 3 || world.bart.hitDeathTimer !== 0) {
    throw new Error(`First damage resolution failed: hp=${world.healthPoints} lives=${world.hud.livesRemaining} hit=${world.bart.hitDeathTimer}`);
  }

  // Normal gameplay resumes; BuildBartRenderObject advances phase 0 -> 4 and hides.
  for (let i = 0; i < 4; i++) world.tick(noInput());
  if (world.bart.blinkPhase !== 4 || world.bart.renderVisible !== false || world.bart.invulnerabilityTimer !== 0x60) {
    throw new Error(`Blink phase failed: phase=${world.bart.blinkPhase} visible=${world.bart.renderVisible} inv=${world.bart.invulnerabilityTimer}`);
  }
  for (let i = 0; i < 4; i++) world.tick(noInput());
  if (world.bart.blinkPhase !== 0 || world.bart.renderVisible !== true || world.bart.invulnerabilityTimer !== 0x5c) {
    throw new Error(`Blink wrap failed: phase=${world.bart.blinkPhase} visible=${world.bart.renderVisible} inv=${world.bart.invulnerabilityTimer}`);
  }

  while (world.bart.invulnerabilityTimer > 0) world.tick(noInput());
  world.bart.x = 400;
  if (!world.bartPlayer.takeHit("smoke hit 2")) throw new Error("Second hit was rejected after invulnerability");
  for (let i = 0; i < 50; i++) world.tick(noInput());
  if (world.hud.livesRemaining !== 2 || world.healthPoints !== 2 || world.bart.x !== world.level.playerConfig.start_x) {
    throw new Error(`Life loss/respawn failed: lives=${world.hud.livesRemaining} hp=${world.healthPoints} x=${world.bart.x}`);
  }
}

// Proven pickup side effects should feed the same RuntimeWorld HUD state.
{
  const world = new RuntimeWorld(loadLevel(1));
  for (const object of world.objects) object.active = false;
  const pickup = world.objects.find((o) => o.collision?.collision_index === 2) ?? null;
  if (!pickup?.collision) throw new Error("No Level-1 handler-2 pickup found");
  pickup.active = true;
  pickup.vmState = "blocked";
  pickup.x = 200 - pickup.collision.x_offset;
  pickup.y = 100 - pickup.collision.y_offset;
  Object.assign(world.bart, {
    x: 194,
    y: 96,
    airborne: false,
    supportKind: "ground",
    supportSourceIndex: null,
    velocityX: 0,
    velocityY: 0,
  });
  world.tick(noInput());
  if (world.hud.score !== 60 || world.hud.livesRemaining !== 4 || pickup.active) {
    throw new Error(`Handler-2 HUD integration failed: score=${world.hud.score} lives=${world.hud.livesRemaining} active=${pickup.active}`);
  }
}

console.log("Damage/HUD smoke: timers, health/lives, DOS blink, respawn, timer pacing and proven pickup HUD effects OK");
