import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
function loadLevel(n){const d=join(root,"wwwroot","data",`level${n}`);const manifest=JSON.parse(readFileSync(join(d,"manifest.json")));const runtime=JSON.parse(readFileSync(join(d,"runtime_data.json")));const scripts=JSON.parse(readFileSync(join(d,"object_scripts.json")));const playerConfig=JSON.parse(readFileSync(join(d,"player_runtime.json")));let eventMessages={messages:[]};try{eventMessages=JSON.parse(readFileSync(join(d,"event_messages.json")));}catch{}return{level:n,manifest,runtime,scripts,playerConfig,eventMessages,eventMessageByKey:new Map((eventMessages.messages??[]).map(m=>[`${m.segment}:${m.offset}`,m])),background:{},descriptorByIndex:new Map(manifest.runtime.object_descriptors.map(x=>[x.index,x])),imageByDescriptorIndex:new Map(),bartDescriptorByIndex:new Map(manifest.runtime.bart_descriptors.map(x=>[x.index,x])),bartImageByDescriptorIndex:new Map(),flowByType:new Map(scripts.object_types.map(x=>[x.type_id,x])),collisionByType:new Map(runtime.collision_profiles.map(x=>[x.type_id,x]))};}
const no={left:false,right:false,jump:false,down:false,action:false,inventory:false};
const world=new RuntimeWorld(loadLevel(1));world.setCollisionsEnabled(false);
// Make source #53 resident first so zone entry proves that clearing 8000h also
// releases the active 30h runtime slot instead of leaving a ghost collider.
if(!world.debugEnsureSourceLoaded(53))throw new Error("Could not pre-load skateboard boundary source #53");
world.bart.x=0x0d6c;world.bart.y=0x7a;world.bart.groundY=0x7a;world.bart.supportY=0x7a;world.bart.supportKind="ground";world.streamCameraX=0x0d6c-0x88;
world.tick(no);
if(world.getSourceStateByOffset(0x03ff)?.flags!==0||world.getSourceStateByOffset(0x052b)?.flags!==0)throw new Error("Skateboard entry did not clear both type-61 boundary sources");
if(world.getObjectBySourceIndex(53)!==null)throw new Error("Disabled boundary source #53 left a resident runtime object");
if(world.bart.spriteDescriptorId!==0x48)throw new Error(`Skateboard idle descriptor should be 40h+8, got ${world.bart.spriteDescriptorId.toString(16)}`);
// Held right enters the 0850h push cycle; state 6 applies +0200h and movement
// begins through the low-byte 082Ch fixed-point accumulator.
const startX=world.bart.x;
for(let i=0;i<16;i++)world.tick({...no,right:true});
if(world.bart.velocityX<=0)throw new Error(`Skateboard push never applied +0200h impulse: ${world.bart.velocityX}`);
if(world.bart.x<=startX)throw new Error(`Skateboard 8.8 integration did not move Bart: ${startX}->${world.bart.x}`);
if(world.bart.spriteDescriptorId<0x40||world.bart.spriteDescriptorId>=0x5a)throw new Error(`Skateboard descriptor escaped normal 40h family: ${world.bart.spriteDescriptorId.toString(16)}`);
// DS:0775!=0 switches BP from 40h to 5Ah regardless of whether FIRE is held.
world.collisionState.inventoryCounts[3]=1;world.tick(no);
if(world.bart.spriteDescriptorId<0x5a)throw new Error(`Spray inventory did not switch skateboard base to 5Ah: ${world.bart.spriteDescriptorId.toString(16)}`);
// Grounded FIRE suppresses normal jump and reuses bit 01h/02h to move the
// 0860h base-Y lane between 72h and 80h.
world.bart.velocityX=0;world.bart.airborne=false;world.bart.y=0x7a;world.bart.groundY=0x7a;world.bart.supportY=0x7a;world.bart.supportKind="ground";
world.tick({...no,action:true,jump:true});
if(world.bart.airborne||world.bart.y!==0x79||world.bart.groundY!==0x79)throw new Error(`action+up lane shift wrong: y=${world.bart.y} ground=${world.bart.groundY} airborne=${world.bart.airborne}`);
world.tick({...no,action:true,down:true});
if(world.bart.y!==0x7a||world.bart.groundY!==0x7a)throw new Error(`action+down lane shift wrong: y=${world.bart.y} ground=${world.bart.groundY}`);
// Leaving [0D6Ch,2180h) restores 8000h and 0860h=007Ah. A source may also
// immediately carry 4000h if the normal streamer reloads it in the same tick.
world.bart.x=0x2180;world.tick(no);
for(const offset of [0x03ff,0x052b]){const flags=world.getSourceStateByOffset(offset)?.flags??0;if((flags&0x8000)===0)throw new Error(`Boundary source ${offset.toString(16)} not restored: ${flags.toString(16)}`);}
if(world.bart.groundY!==0x7a)throw new Error(`Skateboard exit did not restore base Y 7Ah: ${world.bart.groundY}`);
console.log("Level-1 skateboard smoke: 38ECh zone, boundary source disable/restore, 0850h push impulse, 8.8 X integration, 40h/5Ah animation families and FIRE+up/down lane semantics OK");
