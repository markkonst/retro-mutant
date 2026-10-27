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
const level=loadLevel(1);
level.runtime.object_sources=[];
const world=new RuntimeWorld(level);
world.setCollisionsEnabled(false);
const no={left:false,right:false,jump:false,action:false};
world.tick({...no,jump:true});
assert.equal(world.consumeSoundCommand(),3,'Actual jump emits sound');
world.tick({...no,jump:true});
assert.equal(world.consumeSoundCommand(),null,'Held jump must not restart sound');
world.reset();world.collisionState.inventoryCounts[3]=1;world.collisionState.sprayMeter0815=27;
world.tick({...no,action:true});assert.equal(world.consumeSoundCommand(),1);
world.tick({...no,action:true});assert.equal(world.consumeSoundCommand(),1,'Repeated same-ID spray must be delivered');
world.reset();world.bartPlayer.takeHit('test');assert.equal(world.consumeSoundCommand(),10);
world.bartPlayer.takeHit('invulnerable');assert.equal(world.consumeSoundCommand(),null);
world.queueSound(2);world.queueSound(7);assert.equal(world.consumeSoundCommand(),7);
world.queueSound(3);world.reset();assert.equal(world.consumeSoundCommand(),null);
const object=world.objects[0];
Object.assign(object,{active:true,vmState:'ready',scriptPC:0,flow:{instructions:[
  {pc:0,size:4,name:'PlaySound',args:{sound_id:9}},
  {pc:4,size:2,name:'Despawn',args:{}}
],edges:[]}});
world.vm.runUntilYield(object,1);
assert(!object.active);assert.equal(world.consumeSoundCommand(),9,'Sound survives emitter despawn');
world.queueSound(4);world.dispose();assert.equal(world.consumeSoundCommand(),null);
console.log('Audio events: real jump/spray/hit callbacks, repeat suppression/retrigger, VM despawn, mailbox and reset/dispose OK');
