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
const no={left:false,right:false,jump:false,down:false,action:false,inventory:false};

// T38 -> T39: handler15 transition must execute the post-spray 04 0A 06
// ExternalSpecial3Bytes state. With one goal remaining it must also clear
// Level1_GoalBarricadeSource (#123 / 06BBh).
const posterWorld=new RuntimeWorld(loadLevel(1));
posterWorld.setDebugInvulnerable(true);
posterWorld.collisionState.inventoryCounts[3]=0x01;
posterWorld.collisionState.sprayMeter0815=0x1b;
posterWorld.hud.goalsRemaining=1;
const poster=posterWorld.debugEnsureSourceLoaded(8);
if(!poster||poster.typeId!==38)throw new Error("T38 poster source #8 not loaded");
Object.assign(posterWorld.bart,{x:462,y:76,groundY:76,supportY:76,supportKind:"ground",supportSourceIndex:null,velocityX:0,velocityY:0,airborne:false,facing:0});
for(let i=0;i<12&&poster.typeId===38;i++)posterWorld.tick({...no,action:true});
if(poster.typeId!==39)throw new Error(`Poster did not transition T38->T39: T${poster.typeId}`);
posterWorld.tick(no);
if(JSON.stringify(poster.specialRenderBytes)!==JSON.stringify([0x04,0x0a,0x06]))throw new Error(`T39 red render bytes wrong: ${JSON.stringify(poster.specialRenderBytes)}`);
const gate=posterWorld.getSourceStateByOffset(0x06bb);
if(!gate||gate.flags!==0)throw new Error(`Goal barricade source #123 was not cleared at zero goals: ${gate?.flags}`);

// T73 -> T74: exact WRENCH use activates source #27 at 803Fh. Handler20
// decrements its low byte once per pass and transitions the awning at zero.
const awningWorld=new RuntimeWorld(loadLevel(1));
awningWorld.setDebugInvulnerable(true);
const awning=awningWorld.debugEnsureSourceLoaded(26);
if(!awning||awning.typeId!==73)throw new Error("T73 awning source #26 not loaded");
Object.assign(awningWorld.bart,{x:0x0718,y:0x007a,groundY:0x007a,supportY:0x007a,supportKind:"ground",supportSourceIndex:null,velocityX:0,velocityY:0,airborne:false});
awningWorld.collisionState.inventoryCounts[6]=0x01;
awningWorld.collisionState.inventory.selectedItem=6;
awningWorld.tick({...no,down:true});
awningWorld.tick(no); // release A => InventoryUse_Item06 => source #27 = 803Fh
const countdown=awningWorld.getSourceStateByOffset(0x02fb);
if(!countdown||(countdown.flags&0x803f)!==0x803f)throw new Error(`WRENCH did not arm external countdown source: ${countdown?.flags?.toString(16)}`);
for(let i=0;i<64&&awning.typeId===73;i++)awningWorld.tick(no);
if(awning.typeId!==74)throw new Error(`Awning did not transition T73->T74: T${awning.typeId}, countdown=${countdown.flags.toString(16)}`);
awningWorld.tick(no);
if(JSON.stringify(awning.specialRenderBytes)!==JSON.stringify([0x04,0x0a,0x06]))throw new Error(`T74 red render bytes wrong: ${JSON.stringify(awning.specialRenderBytes)}`);

// T90 is the timer 400/200 controller. At exactly 400 it spawns T91, whose
// decoded script animates descriptors 209..214 and moves -0140h/+0100h.
const timerWorld=new RuntimeWorld(loadLevel(1));timerWorld.setCollisionsEnabled(false);
timerWorld.hud.levelTimer=400;timerWorld.hud.timerDivider=0x23;
const t90=timerWorld.debugEnsureSourceLoaded(3);
if(!t90||t90.typeId!==90)throw new Error("T90 source #3 not loaded");
timerWorld.tick(no);
timerWorld.tick(no);
let t91=timerWorld.objects.find(o=>o.active&&o.typeId===91);
if(!t91)throw new Error("T90 did not spawn T91 at timer 400");
timerWorld.tick(no);
timerWorld.tick(no);
if(t91.descriptorIndex!==209||t91.velocityX!==-0x0140||t91.velocityY!==0x0100)throw new Error(`T91 setup wrong: D${t91.descriptorIndex} vx=${t91.velocityX} vy=${t91.velocityY}`);

// X-RAY item 1 toggles 07DE; flag-0400 objects must resolve six descriptors
// (+48h / 0Ch) later while active.
const xrayWorld=new RuntimeWorld(loadLevel(1));xrayWorld.setCollisionsEnabled(false);
const xrayObject=xrayWorld.debugEnsureSourceLoaded(29);
if(!xrayObject||(xrayObject.flags&0x0400)===0)throw new Error("Expected source #29 with 0400h alternate-graphics flag");
xrayWorld.tick(no);
const normalDescriptor=xrayObject.descriptorIndex;
xrayWorld.collisionState.inventory.selectedItem=1;
xrayWorld.tick({...no,down:true});xrayWorld.tick(no);xrayWorld.tick(no);
if(xrayWorld.collisionState.inventory.alternateGraphicsTimer!==0xfa)throw new Error("X-RAY toggle did not set 07DE=FAh");
if(normalDescriptor===null||xrayObject.descriptorIndex!==normalDescriptor+6)throw new Error(`X-RAY descriptor shift wrong: ${normalDescriptor} -> ${xrayObject.descriptorIndex}`);

// Rocket item 5 creates the stationary type-4 reserved action object. It must
// use recovered rocket frames instead of the old moving yellow square.
const rocketWorld=new RuntimeWorld(loadLevel(1));rocketWorld.setCollisionsEnabled(false);
rocketWorld.collisionState.inventoryCounts[5]=0x01;rocketWorld.collisionState.inventory.selectedItem=5;
rocketWorld.tick({...no,down:true});rocketWorld.tick(no);rocketWorld.tick(no);
const rocket=rocketWorld.collisionState.inventory.projectile;
if(!rocket||rocket.kind!=="rocket"||rocket.typeOffset!==0x0004)throw new Error("ROCKET action did not create type-4 reserved object");
if(rocket.velocityX!==0||rocket.velocityY!==0||rocket.accelerationY!==0)throw new Error(`ROCKET must be stationary: ${rocket.velocityX}/${rocket.velocityY}/${rocket.accelerationY}`);
if(rocket.descriptorIndex!==4||rocket.alternateDescriptorIndex!==5)throw new Error(`ROCKET right-facing frames wrong: ${rocket.descriptorIndex}/${rocket.alternateDescriptorIndex}`);

// Once the goal barricade is gone, Nelson source #125 can stream. His first
// instruction enters the DOS boss camera state: left bound 30B7h and max
// bound target+012Ch = 31E3h. Returning to the street is then intentionally
// blocked by the original game state.
const nelson=posterWorld.debugEnsureSourceLoaded(125);
if(!nelson||nelson.typeId!==7)throw new Error("Nelson source #125 did not stream after goal-gate removal");
posterWorld.setCollisionsEnabled(false);
posterWorld.tick(no);
if(posterWorld.bart.minX!==0x30b7||posterWorld.bart.maxX!==0x31e3)throw new Error(`Nelson camera bounds wrong: min=${posterWorld.bart.minX.toString(16)} max=${posterWorld.bart.maxX.toString(16)}`);

const viewerSource=readFileSync(join(root,"src/game/WorldViewer.ts"),"utf8");
for(const token of [
  'a !== 0x04 || b !== 0x0a || c !== 0x06',
  'data[i] === 255 && data[i + 1] === 142 && data[i + 2] === 255',
  'data[i] = 227; data[i + 1] = 0; data[i + 2] = 0',
  'transient.alternateDescriptorIndex',
]) if(!viewerSource.includes(token))throw new Error(`v0.9.6 visual regression token missing: ${token}`);

const assetSource=readFileSync(join(root,"src/game/AssetRepository.ts"),"utf8");
if(!assetSource.includes('[4, 5, 6, 7, 22, 23, 24, 25, 26, 27]'))throw new Error("Common-overlay surrogate frames are not force-loaded");

console.log("Level-1 v0.9.6 smoke: T38/T39 + T73/T74 red states, handler20 countdown, T90/T91, X-RAY +6 descriptors, stationary rocket artwork, gate removal and Nelson boss bounds OK");
