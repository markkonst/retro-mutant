import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
for (let levelNumber = 1; levelNumber <= 5; levelNumber++) {
  const dataRoot = join(root, "wwwroot", "data", `level${levelNumber}`);
  const manifest = JSON.parse(readFileSync(join(dataRoot, "manifest.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(join(dataRoot, "runtime_data.json"), "utf8"));
  const scripts = JSON.parse(readFileSync(join(dataRoot, "object_scripts.json"), "utf8"));
  const playerConfig = JSON.parse(readFileSync(join(dataRoot, "player_runtime.json"), "utf8"));

  for (const descriptor of manifest.runtime.bart_descriptors) {
    const png = join(dataRoot, "bart_frames", `bart_${String(descriptor.index).padStart(3, "0")}.png`);
    if (!existsSync(png)) throw new Error(`Missing ${png}`);
  }

  const level = {
    level: levelNumber,
    manifest,
    runtime,
    scripts,
    playerConfig,
    background: {},
    descriptorByIndex: new Map(manifest.runtime.object_descriptors.map((descriptor) => [descriptor.index, descriptor])),
    imageByDescriptorIndex: new Map(),
    bartDescriptorByIndex: new Map(manifest.runtime.bart_descriptors.map((descriptor) => [descriptor.index, descriptor])),
    bartImageByDescriptorIndex: new Map(),
    flowByType: new Map(scripts.object_types.map((flow) => [flow.type_id, flow])),
    collisionByType: new Map(runtime.collision_profiles.map((profile) => [profile.type_id, profile])),
  };

  const world = new RuntimeWorld(level);
  const startX = world.bart.x;
  for (let tick = 0; tick < 40; tick++) world.tick({ left: false, right: true, jump: false });
  if (world.bart.x <= startX) throw new Error(`L${levelNumber}: Bart did not move right`);

  // Reset before the jump test: with real terrain collisions, horizontal momentum
  // may carry Bart onto a spring/platform instead of the old flat-ground fallback.
  world.reset();
  const startY = world.bart.y;
  for (let tick = 0; tick < 4; tick++) world.tick({ left: false, right: false, jump: true });
  if (!world.bart.airborne || world.bart.y >= startY) throw new Error(`L${levelNumber}: Bart did not jump`);
  for (let tick = 0; tick < 120 && world.bart.airborne; tick++) world.tick({ left: false, right: false, jump: false });
  if (world.bart.airborne) throw new Error(`L${levelNumber}: Bart did not land on ground/terrain/platform`);

  const descriptorStates = world.objects.filter((object) => object.descriptorIndex !== null).length;
  const animations = world.objects.filter((object) => object.animFrameCount > 1).length;
  console.log(`L${levelNumber}: tick=${world.tickCount}, Bart=${world.bart.x},${world.bart.y} D${world.bart.spriteDescriptorId}, descriptorStates=${descriptorStates}, animations=${animations}, blocked=${world.getStats().blockedObjects}`);
}
