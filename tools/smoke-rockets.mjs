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

import assert from 'node:assert/strict';
const no={left:false,right:false,jump:false,down:false,action:false};
function setup(x,right=true) {
 const w=new RuntimeWorld(loadLevel(1));w.setDebugInvulnerable(true);
 Object.assign(w.bart,{x,y:122,groundY:122,facing:right?0:1,velocityX:0,velocityY:0,airborne:false});
 w.collisionState.inventoryCounts[5]=1;w.collisionState.inventory.selectedItem=5;
 w.tick({...no,down:true});w.tick(no);w.tick(no);
 assert.equal(w.collisionState.inventory.projectile?.kind,'rocket');
 return w;
}
// Unlit rockets follow Wait 99 -> Despawn: no arbitrary 48-tick timeout.
const dormant=setup(1000);dormant.setCollisionsEnabled(false);
const unlit=dormant.collisionState.inventory.projectile;
for(let i=0;i<99;i++)dormant.tick(no);
assert(unlit.active);dormant.tick(no);assert(!unlit.active);
for(const right of [true,false]) {
 const w=setup(1000,right);w.setCollisionsEnabled(false);
 const p=w.collisionState.inventory.projectile;
 assert.equal(p.descriptorIndex,right?12:13);
 // Move the player's fuse point into [rocket.x, rocket.x+8].
 w.bart.x+=right?8:-8;w.tick(no);
 assert.equal(p.velocityX,right?0x300:-0x300);
 assert.equal(p.velocityY,-0x600);
 const startX=p.x;
 for(let i=0;i<20;i++)w.tick(no);
 assert.notEqual(p.velocityX,0,'Still flying before explosion');
 w.tick(no);
 assert.equal(p.velocityX,0);assert.equal(p.velocityY,0);
 assert.equal(p.descriptorIndex,14,'Explosion uses original four-frame animation');
 const seen=new Set([p.descriptorIndex]);
 for(let i=0;i<13;i++){w.tick(no);seen.add(p.descriptorIndex);}
 assert.deepEqual([...seen].sort(),[14,15,16,17]);
 assert(p.active);w.tick(no);assert(!p.active,'Explosion Wait 13 -> Despawn');
 assert(right?p.x>startX:p.x<startX);
}
// Exercise original target placements, source flags, collision profiles and
// post-hit scripts. Only initial Bart positioning/item grant are test setup.
for(const sourceIndex of [52,94,108,113,115,120]) {
 const level=loadLevel(1),source=level.runtime.object_sources[sourceIndex];
 const w=setup(source.x-117);
 const target=w.debugEnsureSourceLoaded(sourceIndex);
 assert(target,`source ${sourceIndex} streams`);
 const originalType=target.typeId;
 w.bart.x+=8;
 for(let i=0;i<40 && target.typeId===originalType;i++)w.tick(no);
 assert.notEqual(target.typeId,originalType,`Rocket must hit original source ${sourceIndex}`);
 console.log(`Rocket target #${sourceIndex}: type ${originalType} -> ${target.typeId}`);
}
console.log('Rocket smoke: placement, ignition, signed flight, original frames, expiry and all six source targets OK');
