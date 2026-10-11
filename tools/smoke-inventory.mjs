import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";
import { INVENTORY_ITEMS } from "../wwwroot/js/game/InventorySystem.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
function loadLevel(levelNumber) {
  const dataRoot = join(root, "wwwroot", "data", `level${levelNumber}`);
  const manifest = JSON.parse(readFileSync(join(dataRoot, "manifest.json"), "utf8"));
  const runtime = JSON.parse(readFileSync(join(dataRoot, "runtime_data.json"), "utf8"));
  const scripts = JSON.parse(readFileSync(join(dataRoot, "object_scripts.json"), "utf8"));
  const playerConfig = JSON.parse(readFileSync(join(dataRoot, "player_runtime.json"), "utf8"));
  return {
    level: levelNumber, manifest, runtime, scripts, playerConfig, background: {},
    descriptorByIndex: new Map(manifest.runtime.object_descriptors.map((d) => [d.index, d])), imageByDescriptorIndex: new Map(),
    bartDescriptorByIndex: new Map(manifest.runtime.bart_descriptors.map((d) => [d.index, d])), bartImageByDescriptorIndex: new Map(),
    flowByType: new Map(scripts.object_types.map((f) => [f.type_id, f])),
    collisionByType: new Map(runtime.collision_profiles.map((c) => [c.type_id, c])),
  };
}
const no = { left:false,right:false,jump:false,action:false,inventory:false };
function useSelected(world, item) {
  world.collisionState.inventory.selectedItem = item;
  world.tick({ ...no, inventory:true });
  world.tick(no);
}

if (INVENTORY_ITEMS.length !== 14 || INVENTORY_ITEMS[1].name !== "X-RAY SPECS" || INVENTORY_ITEMS[12].name !== "KEY") {
  throw new Error("Inventory metadata table mismatch");
}

const world = new RuntimeWorld(loadLevel(1));
world.setCollisionsEnabled(false);
// Startup inventory bytes: coin=10 BCD, pause=1.
if (world.collisionState.inventoryCounts[2] !== 0x10 || world.collisionState.inventoryCounts[13] !== 1) throw new Error("Inventory reset bytes wrong");

// Original selector: item 1 -> item 2 because item 2 has stock.
world.tick({ ...no, inventory:true, action:true });
if (world.collisionState.inventory.selectedItem !== 2) throw new Error(`Inventory cycle failed: ${world.collisionState.inventory.selectedItem}`);
world.tick({ ...no, inventory:false, action:false }); // wrong-location coin -> selection 1
if (world.collisionState.inventory.selectedItem !== 1) throw new Error("Coin wrong-location reset failed");

// X-ray toggles alternate graphics state on inventory release.
useSelected(world, 1);
if (world.collisionState.inventory.alternateGraphicsTimer !== 0xfa) throw new Error("X-ray toggle-on failed");
useSelected(world, 1);
if (world.collisionState.inventory.alternateGraphicsTimer !== 0) throw new Error("X-ray toggle-off failed");

// Wrench activates the recovered LevelRuntimeConfig +68h source record.
world.collisionState.inventoryCounts[6] = 1;
world.bart.x = 0x718;
useSelected(world, 6);
const wrenchSource = world.getSourceStateByOffset(world.level.playerConfig.inventory_item6_source_offset);
if (!wrenchSource || (wrenchSource.flags & ~0x4000) !== 0x803f) throw new Error(`Wrench source activation failed: ${wrenchSource?.flags}`);

// Key uses the recovered RepositionBart targets.
world.collisionState.inventoryCounts[12] = 1;
world.bart.x = 0x430;
useSelected(world, 12);
if (world.bart.x !== 0x2b44) throw new Error(`Key teleport failed: ${world.bart.x.toString(16)}`);

// Spray action builds the separate handler-15 line hitbox and meters ammo.
world.collisionState.inventoryCounts[3] = 1;
world.collisionState.sprayMeter0815 = 0x1b;
world.tick({ ...no, action:true });
if (!world.collisionState.inventory.actionActive || !world.collisionState.inventory.actionHitbox) throw new Error("Spray action hitbox not active");

// Slingshot is selected by availability once spray/dart are absent.
world.collisionState.inventoryCounts[3] = 0;
world.collisionState.inventoryCounts[10] = 1;
world.collisionState.level3Meter0782 = 0x0c;
world.tick(no); // release FIRE edge
for (let i = 0; i < 12; i++) world.tick(no); // recovered spray/action cooldown
world.tick({ ...no, action:true });
if (world.collisionState.inventory.projectile?.kind !== "slingshot" || world.collisionState.level3Meter0782 !== 0x0b) {
  throw new Error(`Slingshot fire failed: ${world.collisionState.inventory.projectile?.kind} meter=${world.collisionState.level3Meter0782}`);
}

useSelected(world, 13);
if (!world.consumePauseRequest()) throw new Error("Pause inventory item failed");
console.log("Inventory smoke: 14-slot metadata, selector, X-ray, wrench, key, spray hitbox, slingshot meter/projectile, pause OK");
