import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
function loadLevel(n){const d=join(root,"wwwroot","data",`level${n}`);const manifest=JSON.parse(readFileSync(join(d,"manifest.json")));const runtime=JSON.parse(readFileSync(join(d,"runtime_data.json")));const scripts=JSON.parse(readFileSync(join(d,"object_scripts.json")));const playerConfig=JSON.parse(readFileSync(join(d,"player_runtime.json")));let eventMessages={messages:[]};try{eventMessages=JSON.parse(readFileSync(join(d,"event_messages.json")));}catch{}return{level:n,manifest,runtime,scripts,playerConfig,eventMessages,eventMessageByKey:new Map((eventMessages.messages??[]).map(m=>[`${m.segment}:${m.offset}`,m])),background:{},descriptorByIndex:new Map(manifest.runtime.object_descriptors.map(x=>[x.index,x])),imageByDescriptorIndex:new Map(),bartDescriptorByIndex:new Map(manifest.runtime.bart_descriptors.map(x=>[x.index,x])),bartImageByDescriptorIndex:new Map(),flowByType:new Map(scripts.object_types.map(x=>[x.type_id,x])),collisionByType:new Map(runtime.collision_profiles.map(x=>[x.type_id,x]))};}
const w1=new RuntimeWorld(loadLevel(1));
if(w1.activeLevelHandler!==1)throw new Error(`Level-1 handlers not loaded: ${w1.activeLevelHandler}`);
const meter=w1.getLevelHudMeter();
if(!meter||meter.label!=="SPR"||meter.max!==27)throw new Error(`Level-1 HUD handler missing: ${JSON.stringify(meter)}`);
w1.dispose();
if(w1.activeLevelHandler!==null)throw new Error("dispose() did not unload old level handlers");
const w2=new RuntimeWorld(loadLevel(2));
if(w2.activeLevelHandler!==2)throw new Error(`Level-2 empty handler set not loaded: ${w2.activeLevelHandler}`);
if(w2.getLevelHudMeter()!==null)throw new Error("Level-2 unexpectedly inherited Level-1 HUD handler");
w2.dispose();
console.log("Level handler smoke: typed load/unload lifecycle, Level-1 provider and no stale handler leakage OK");
