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
    level: levelNumber, manifest, runtime, scripts, playerConfig, background: {},
    descriptorByIndex: new Map(manifest.runtime.object_descriptors.map((d) => [d.index, d])),
    imageByDescriptorIndex: new Map(),
    bartDescriptorByIndex: new Map(manifest.runtime.bart_descriptors.map((d) => [d.index, d])),
    bartImageByDescriptorIndex: new Map(),
    flowByType: new Map(scripts.object_types.map((f) => [f.type_id, f])),
    collisionByType: new Map(runtime.collision_profiles.map((c) => [c.type_id, c])),
  };
}

const world = new RuntimeWorld(loadLevel(1));
const sheet = world.debugEnsureSourceLoaded(12);
if (!sheet?.collision || sheet.typeId !== 63 || sheet.collision.collision_index !== 9 || sheet.collision.height !== 0) {
  throw new Error("Level-1 clothesline source #12 fixture changed");
}
for (const object of world.objects) object.active = object === sheet;
world.bart.x = 894;
world.bart.y = 26; // terrain surface 56 - Bart 30px landing offset
world.bart.groundY = 122;
world.bart.supportY = 26;
world.bart.supportKind = "terrain";
world.bart.airborne = false;

world.tick({ left: false, right: false, jump: false });
if (sheet.typeId !== 64 || sheet.typeOffset !== 128) {
  throw new Error(`Clothesline line collision did not transition 63->64: type=${sheet.typeId}/${sheet.typeOffset}`);
}
if (world.hud.score !== 100 || world.hud.goalsRemaining !== world.hud.goalsInitial - 1) {
  throw new Error(`Negative clothesline transition side-effects wrong: score=${world.hud.score} goals=${world.hud.goalsRemaining}`);
}
world.tick({ left: false, right: false, jump: false });
if (sheet.velocityY !== 0x0100 || sheet.animFrameCount !== 2 || sheet.descriptorIndex !== 157) {
  throw new Error(`Falling-sheet script did not start: vy=${sheet.velocityY} frames=${sheet.animFrameCount} desc=${sheet.descriptorIndex}`);
}
for (let i = 0; i < 45; i++) world.tick({ left: false, right: false, jump: false });
if (sheet.typeId !== 65) throw new Error(`Falling sheet did not settle to type65: ${sheet.typeId}`);
console.log(`Clothesline smoke: source #12 line trigger -> type64 falling -> type65 settled, y=${sheet.y}`);
