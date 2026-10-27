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
function setup(x,item,right=true) {
 const w=new RuntimeWorld(loadLevel(1));w.setDebugInvulnerable(true);
 Object.assign(w.bart,{x,y:122,groundY:122,facing:right?0:1,velocityX:0,velocityY:0,airborne:false});
 w.collisionState.inventoryCounts[item]=1;w.collisionState.inventory.selectedItem=item;
 return w;
}
function use(w){w.tick({...no,down:true});w.tick(no);}
// Source #121 starts disabled (bit 0 only). The whistle's exact inclusive
// X range enables it. Wrong positions must neither spawn Grandpa nor consume it.
for(const x of [0x2d2f,0x2d81]) {
 const w=setup(x,8);use(w);w.tick(no);
 assert.equal(w.getSourceStateByOffset(1703).flags,1);
 assert.equal(w.collisionState.inventoryCounts[8],1);
 assert(!w.objects.some(o=>o.active&&o.typeId===71));
}
for(const x of [0x2d30,0x2d80]) {
 const w=setup(x,8);use(w);w.tick(no);
 assert(w.objects.some(o=>o.active&&o.typeId===71));
 assert.equal(w.collisionState.inventory.lastSoundId,15);
}
const w=setup(0x2d50,8);use(w);
const coins=new Set();let grandpaSeen=false;
for(let i=0;i<420;i++){
 w.tick(no);
 for(const o of w.objects) {
  if(o.active&&o.typeId===71){grandpaSeen=true;assert.equal(o.descriptorIndex,187);}
  // Runtime slots are reused; synthetic source IDs identify distinct spawns.
  if(o.active&&o.typeId===72)coins.add(o.source.index);
  if(o.active)assert.notEqual(o.vmState,'blocked');
 }
}
assert(grandpaSeen);assert.equal(coins.size,8);
assert(!w.objects.some(o=>o.active&&o.typeId===71));
assert.equal(w.getSourceStateByOffset(1703).flags,0);
w.collisionState.inventory.selectedItem=8;use(w);w.tick(no);
assert(!w.objects.some(o=>o.active&&o.typeId===71),'Whistling cannot repeat the completed reward');
console.log('Whistle/Grandpa: location bounds, sound 15, original frame, eight coins, departure and one-shot source OK');

// Both original bomb scripts: no invented initial upward velocity, lifetime
// or rectangle. The script waits for Y >= 142, then runs frames 8..11.
for(const right of [true,false]) {
 const b=setup(1000,4,right);b.setCollisionsEnabled(false);use(b);b.tick(no);
 const bomb=b.collisionState.inventory.projectile;assert(bomb?.scriptRuntime);
 assert.equal(bomb.velocityX,right?752:-752);assert.equal(bomb.velocityY,32);
 const seen=new Set();let stopped=false;
 for(let i=0;i<80;i++){
  if(bomb.active){seen.add(bomb.descriptorIndex);if(bomb.velocityX===0){stopped=true;assert(bomb.y>=142);}}
  b.tick(no);
 }
 assert(stopped);assert(!bomb.active);
 for(const frame of [8,9,10,11])assert(seen.has(frame));
 assert.equal(b.collisionState.inventoryCounts[4],0);
}
const level=loadLevel(1),source=level.runtime.object_sources.find(s=>s.type_id===26);
assert(source);
for(const hit of [true,false]) {
 const b=setup(hit?0xb08:0xb70,4);const target=b.debugEnsureSourceLoaded(source.index);
 assert(target);use(b);for(let i=0;i<60;i++)b.tick(no);
 assert.equal(target.typeId,hit?28:26,hit?'Bomb target must transition':'Distant explosion must miss');
}
console.log('Bomb: signed original scripts, ground wait, explosion frames, ammo, real target hit and miss OK');

// This is the recovered timed passer-by, not a cinema entrance/bonus screen.
for(const time of [400,200,399,201]){
 const t=new RuntimeWorld(loadLevel(1));t.setCollisionsEnabled(false);
 t.hud.levelTimer=time;t.hud.timerDivider=0x23;
 t.debugEnsureSourceLoaded(3);t.tick(no);t.tick(no);
 assert.equal(t.objects.some(o=>o.active&&o.typeId===91),time===400||time===200);
}
console.log('Cinema-area timer: passer-by spawns at 400/200 only; cinema entry/show remains unimplemented');
