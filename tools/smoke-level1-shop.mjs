import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
function loadLevel(n){const d=join(root,"wwwroot","data",`level${n}`);const manifest=JSON.parse(readFileSync(join(d,"manifest.json")));const runtime=JSON.parse(readFileSync(join(d,"runtime_data.json")));const scripts=JSON.parse(readFileSync(join(d,"object_scripts.json")));const playerConfig=JSON.parse(readFileSync(join(d,"player_runtime.json")));return{level:n,manifest,runtime,scripts,playerConfig,background:{},descriptorByIndex:new Map(manifest.runtime.object_descriptors.map(x=>[x.index,x])),imageByDescriptorIndex:new Map(),bartDescriptorByIndex:new Map(manifest.runtime.bart_descriptors.map(x=>[x.index,x])),bartImageByDescriptorIndex:new Map(),flowByType:new Map(scripts.object_types.map(x=>[x.type_id,x])),collisionByType:new Map(runtime.collision_profiles.map(x=>[x.type_id,x]))};}
const no={left:false,right:false,jump:false,down:false,action:false,inventory:false};
const w=new RuntimeWorld(loadLevel(1));w.setCollisionsEnabled(false);
Object.assign(w.bart,{x:0x06e0,y:0x007a,groundY:0x007a,supportY:0x007a,supportKind:"ground",supportSourceIndex:null,velocityX:0,velocityY:0,airborne:false});
w.tick({...no,jump:true});
let overlay=w.getLevelInteractionOverlay();
if(!overlay||overlay.state!==0x02||overlay.options[0]?.itemId!==12||overlay.options[1]?.itemId!==6)throw new Error(`Storefront trigger/record wrong: ${JSON.stringify(overlay)}`);
w.tick(no); // 02 -> 04, timer 0F
const transientCount=()=>w.objects.filter(o=>o.active&&!o.sourceAttached&&o.typeOffset===0xffff&&o.vmNote?.includes("AllocateTransientGraphicObject")).length;
if(transientCount()!==1)throw new Error(`State02 did not reserve primary DOS transient slot: ${transientCount()}`);
let primary=w.objects.find(o=>o.active&&!o.sourceAttached&&o.typeOffset===0xffff&&o.renderOffset===0x30a6);
if(!primary||primary.descriptorIndex!==24)throw new Error(`Shop door open surrogate wrong: ${primary?.renderOffset?.toString(16)}/D${primary?.descriptorIndex}`);
for(let i=0;i<15;i++)w.tick(no); // 04 -> 06
w.tick(no); // 06 -> 08
if(transientCount()!==4)throw new Error(`State06 did not reserve three effect slots: ${transientCount()}`);
overlay=w.getLevelInteractionOverlay();
if(!overlay||overlay.state!==0x08)throw new Error(`Shop did not reach state08: ${JSON.stringify(overlay)}`);
if(w.collisionState.inventoryCounts[2]!==0x10)throw new Error(`Initial DOS coin count wrong: ${w.collisionState.inventoryCounts[2].toString(16)}`);
w.tick({...no,action:true});
if(w.collisionState.inventoryCounts[2]!==0x09||w.collisionState.inventoryCounts[12]!==0x01)throw new Error(`KEY purchase wrong: coins=${w.collisionState.inventoryCounts[2].toString(16)} key=${w.collisionState.inventoryCounts[12]}`);
w.tick(no); // release FIRE latch
w.tick({...no,right:true});
overlay=w.getLevelInteractionOverlay();
if(!overlay||overlay.selectedIndex!==1)throw new Error("P/right did not select WRENCH");
w.tick({...no,action:true});
if(w.collisionState.inventoryCounts[2]!==0x08||w.collisionState.inventoryCounts[6]!==0x01)throw new Error(`WRENCH purchase wrong: coins=${w.collisionState.inventoryCounts[2].toString(16)} wrench=${w.collisionState.inventoryCounts[6]}`);
w.tick({...no,down:true});
w.tick(no); // 0A clears the three effects
if(transientCount()!==1)throw new Error(`State0A did not clear effect slots: ${transientCount()}`);
w.tick(no); // 0C repoints the primary door to its closed graphic
primary=w.objects.find(o=>o.active&&!o.sourceAttached&&o.typeOffset===0xffff);
if(!primary||primary.renderOffset!==0x30be||primary.descriptorIndex!==22)throw new Error(`Shop door close surrogate wrong: ${primary?.renderOffset?.toString(16)}/D${primary?.descriptorIndex}`);
for(let i=0;i<20&&w.getLevelInteractionOverlay();i++)w.tick(no);
if(w.getLevelInteractionOverlay())throw new Error("A/down did not close Level-1 shop sequence");
if(transientCount()!==0)throw new Error(`State10 did not clear primary transient slot: ${transientCount()}`);
console.log("Level-1 shop smoke: Q storefront trigger, states 02..10 + 4 DOS transient pool slots, recovered open/closed door surrogates, O/P selection, Space BCD purchase/stock and A exit OK");
