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
const w=new RuntimeWorld(loadLevel(1));w.setDebugInvulnerable(true);
assert.equal(w.level.playerConfig.helper_token_count,6);
assert.equal(w.level.playerConfig.helper_source_offset,0x6c5);
const initialGoals=w.hud.goalsRemaining;
// Defeat six original aliens; use their actual death scripts to create tokens.
// Only Bart positioning is supplied by the test, not tokens/helper enable flags.
for(const [index,sourceIndex] of [4,19,29,34,48,89].entries()) {
 const source=w.level.runtime.object_sources[sourceIndex];w.teleportBart(source.x);
 const alien=w.debugEnsureSourceLoaded(sourceIndex);assert(alien&&alien.typeId===60);
 Object.assign(w.bart,{x:alien.x,y:alien.y-27,airborne:true,velocityY:256});
 w.collisions.resolveObjectCollisions({x:w.bart.x,y:w.bart.y-1},new Map(),[alien]);
 assert.equal(alien.typeId,3,'Stomping alien selects original defeated-alien script');
 w.bart.x=alien.x+60;
 let token;
 for(let i=0;i<8&&!token;i++){w.tick(no);token=w.objects.find(o=>o.active&&o.typeId===6);}
 assert(token,'Defeated alien must spawn token');
 Object.assign(w.bart,{x:token.x-2,y:token.y-10,airborne:false});
 w.collisions.resolveObjectCollisions({x:w.bart.x,y:w.bart.y},new Map(),[token]);
 assert.equal(w.helperTokensCollected,index+1);
 assert.equal(w.hud.goalsRemaining,initialGoals,'Helper letters are not purple-object goals');
 assert.equal(w.collisionState.levelProgress0766,0,'Do not corrupt another level progression index');
 assert.equal(w.getSourceStateByOffset(0x6c5).flags,index===5?0x8000:0);
}
// Walk into the cleared arena with Maggie earned, then redirect her ball by
// an airborne collision. Its original type-86 script must hit Nelson for 3 HP.
while(w.hud.goalsRemaining>0)w.decrementGoals();
w.teleportBart(0x3140);let ball;
for(let i=0;i<30;i++){w.tick(no);ball=w.objects.find(o=>o.active&&o.typeId===85);if(ball&&ball.y>=60)break;}
assert(w.objects.some(o=>o.active&&o.typeId===84),'Earned Maggie must stream into the arena');
assert(ball,'Maggie must produce the original ball');
Object.assign(w.bart,{x:ball.x,y:ball.y-8,airborne:true});
w.collisions.resolveObjectCollisions({x:w.bart.x,y:w.bart.y},new Map(),[ball]);
assert.equal(ball.typeId,86,'Airborne Bart redirects Maggie ball');
w.bart.x=0x30bc;w.bart.y=122;w.bart.airborne=false;
for(let i=0;i<100&&w.collisionState.bossHitPoints===10;i++)w.tick(no);
assert.equal(w.collisionState.bossHitPoints,7,'Original helper projectile must remove three Nelson HP');
w.reset();assert.equal(w.helperTokensCollected,0);assert.equal(w.getSourceStateByOffset(0x6c5).flags,0);
console.log('Maggie: six defeated aliens -> six tokens -> helper enabled -> original ball -> three Nelson HP; reset OK');

for(const time of [400,200]) {
 const cinema=new RuntimeWorld(loadLevel(1));cinema.setDebugInvulnerable(true);
 cinema.teleportBart(330);cinema.hud.levelTimer=time;cinema.hud.timerDivider=0x23;
 cinema.debugEnsureSourceLoaded(3);let passer;
 for(let i=0;i<5&&!passer;i++){cinema.tick(no);passer=cinema.objects.find(o=>o.active&&o.typeId===91);}
 assert(passer);cinema.collisionState.inventoryCounts[3]=1;cinema.collisionState.sprayMeter0815=27;
 const goals=cinema.hud.goalsRemaining;
 for(let i=0;i<10&&passer.typeId===91;i++){
  Object.assign(cinema.bart,{x:passer.x-16,y:passer.y,groundY:passer.y,airborne:false,facing:0});
  cinema.tick({...no,action:true});
 }
 assert.equal(passer.typeId,92);assert.equal(cinema.hud.goalsRemaining,goals-1);
 for(let i=0;i<4;i++)cinema.tick(no);
 assert(passer.descriptorIndex>=215&&passer.descriptorIndex<=220);
}
console.log('Cinema: both timed exits -> spray goal -> original angry-passer-by frames');

const statue=new RuntimeWorld(loadLevel(1));statue.setDebugInvulnerable(true);
statue.teleportBart(3372-117);statue.collisionState.inventoryCounts[5]=1;statue.collisionState.inventory.selectedItem=5;
const bird=statue.debugEnsureSourceLoaded(52), goals=statue.hud.goalsRemaining;
statue.tick({...no,down:true});statue.tick(no);statue.tick(no);statue.bart.x+=8;
for(let i=0;i<80&&!statue.globalEvent;i++)statue.tick(no);
assert.equal(bird.typeId,29);assert.equal(statue.hud.goalsRemaining,goals-1);
assert.equal(statue.globalEvent.offset,0x170b);assert(statue.globalEvent.lines.join(' ').includes('AHEAD'));
for(let i=0;i<70;i++)statue.tick(no);
assert.equal(statue.getSourceStateByOffset(0x3f5).flags,0,'Bird leaves permanently');
console.log('Jebediah: rocket -> purple bird leaves -> original AHEAD message -> permanent source removal');
