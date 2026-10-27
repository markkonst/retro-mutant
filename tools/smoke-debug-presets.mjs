import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
function loadLevel(n){
  const d=join(root,"wwwroot","data",`level${n}`);
  const manifest=JSON.parse(readFileSync(join(d,"manifest.json")));
  const runtime=JSON.parse(readFileSync(join(d,"runtime_data.json")));
  const scripts=JSON.parse(readFileSync(join(d,"object_scripts.json")));
  const playerConfig=JSON.parse(readFileSync(join(d,"player_runtime.json")));
  let eventMessages={messages:[]};try{eventMessages=JSON.parse(readFileSync(join(d,"event_messages.json")));}catch{}
  return {level:n,manifest,runtime,scripts,playerConfig,eventMessages,eventMessageByKey:new Map((eventMessages.messages??[]).map(m=>[`${m.segment}:${m.offset}`,m])),background:{},descriptorByIndex:new Map(manifest.runtime.object_descriptors.map(x=>[x.index,x])),imageByDescriptorIndex:new Map(),bartDescriptorByIndex:new Map(manifest.runtime.bart_descriptors.map(x=>[x.index,x])),bartImageByDescriptorIndex:new Map(),flowByType:new Map(scripts.object_types.map(x=>[x.type_id,x])),collisionByType:new Map(runtime.collision_profiles.map(x=>[x.type_id,x]))};
}

import assert from "node:assert/strict";
const no={left:false,right:false,jump:false,down:false,action:false};

import { Level1DebugTools, LEVEL1_DEBUG_PRESETS } from "../wwwroot/js/debug/Level1DebugTools.js";
const tools = new Level1DebugTools();
const world = new RuntimeWorld(loadLevel(1));
world.setDebugInvulnerable(true);
const originalSources = JSON.stringify(world.level.runtime.object_sources);
for (const preset of LEVEL1_DEBUG_PRESETS) {
  tools.apply(world, preset.id);
  world.tick(no);
  assert.equal(world.objects.length, 28);
  assert(!world.hud.gameOver);
}
assert.equal(JSON.stringify(world.level.runtime.object_sources), originalSources, "Original extracted placements must remain unchanged");
assert.throws(() => tools.apply(new RuntimeWorld(loadLevel(2)), "nelson"), /Level 1/);
tools.apply(world, "nelson");
for (let i=0; i<8; i++) world.tick(no);
assert(world.objects.some(o=>o.active && o.typeId===7), "Nelson must stream from the preset");
assert.equal(world.hud.goalsRemaining, 0);
assert.equal(world.collisionState.bossHitPoints, 10);
assert.equal(world.helperTokensCollected, 0);
tools.apply(world, "maggie-arena");
for (let i=0; i<8; i++) world.tick(no);
assert(world.objects.some(o=>o.active && o.typeId===84), "Maggie must stream");
tools.apply(world, "grandpa");
assert.equal(world.bart.x, 0x2d50);
assert.equal(world.collisionState.inventoryCounts[5], 0x10);
assert.equal(world.collisionState.inventory.selectedItem, 5);
assert.equal(world.bart.minX, 0, "Arena bounds must not leak into hospital");
world.tick(no);
world.tick({...no,down:true}); world.tick(no);
world.tick(no);
assert.equal(world.collisionState.inventory.projectile?.kind, "rocket", "Hospital supplies must create an actual rocket");
tools.apply(world, "grandpa");
world.tick(no);
world.collisionState.inventory.selectedItem=8;
world.tick({...no,down:true});world.tick(no);
for(let i=0;i<5;i++)world.tick(no);
assert(world.objects.some(o=>o.active&&o.typeId===71), "Hospital whistle must activate Grandpa");
tools.apply(world, "cinema");
for(let i=0;i<8;i++)world.tick(no);
assert(world.objects.some(o=>o.active&&o.typeId===91), "Cinema preset must reach real timed spawn");
tools.apply(world, "phone");
world.tick(no);world.tick({...no,down:true});world.tick(no);
assert(world.getSourceStateByOffset(world.level.playerConfig.progress_source_offset).flags & 0x8000, "Phone preset must satisfy the coin location rule");
world.reset();
const gate=world.debugEnsureSourceLoaded(123);
assert(gate?.active);
tools.apply(world, "goals");
assert.equal(gate.active,false, "Clear goals must remove an already loaded gate");
assert.equal(world.getSourceStateByOffset(world.level.playerConfig.goal_gate_source_offset).flags,0);
assert.equal(world.levelFinished,false, "Clearing objectives must not skip the boss");
console.log("Debug presets: real Nelson/Maggie/Grandpa/cinema/phone paths, rocket supplies, gate removal, reset isolation, original data unchanged");
