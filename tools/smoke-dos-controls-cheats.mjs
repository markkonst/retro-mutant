import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";

const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
function loadLevel(n){const d=join(root,"wwwroot","data",`level${n}`);const manifest=JSON.parse(readFileSync(join(d,"manifest.json")));const runtime=JSON.parse(readFileSync(join(d,"runtime_data.json")));const scripts=JSON.parse(readFileSync(join(d,"object_scripts.json")));const playerConfig=JSON.parse(readFileSync(join(d,"player_runtime.json")));let eventMessages={messages:[]};try{eventMessages=JSON.parse(readFileSync(join(d,"event_messages.json")));}catch{}return{level:n,manifest,runtime,scripts,playerConfig,eventMessages,eventMessageByKey:new Map((eventMessages.messages??[]).map(m=>[`${m.segment}:${m.offset}`,m])),background:{},descriptorByIndex:new Map(manifest.runtime.object_descriptors.map(x=>[x.index,x])),imageByDescriptorIndex:new Map(),bartDescriptorByIndex:new Map(manifest.runtime.bart_descriptors.map(x=>[x.index,x])),bartImageByDescriptorIndex:new Map(),flowByType:new Map(scripts.object_types.map(x=>[x.type_id,x])),collisionByType:new Map(runtime.collision_profiles.map(x=>[x.type_id,x]))};}
const no={left:false,right:false,jump:false,down:false,action:false,inventory:false};

// The viewer keeps the original physical-key sequences, including keypad-minus.
const app=readFileSync(join(root,"src/ui/App.ts"),"utf8");
for(const token of [
  '["KeyC", "KeyO", "KeyW", "KeyA", "KeyB", "KeyU", "KeyN", "KeyG", "KeyA"]',
  '["NumpadSubtract", "KeyE", "KeyA", "KeyT", "KeyM", "KeyY", "KeyS", "KeyH", "KeyO", "KeyR", "KeyT", "KeyS"]',
  'case "KeyF":',
]) if(!app.includes(token)) throw new Error(`DOS cheat/input declaration missing: ${token}`);

// Normal DOS run transition: FIRE is NOT required. A plain Q jump starts at
// the normal 0200h cap; if Q is still held on landing, 512Eh promotes to
// 0400h/reload=1. Direction may begin only after takeoff and Bart still runs.
{
  const w=new RuntimeWorld(loadLevel(1));w.setCollisionsEnabled(false);
  w.tick({...no,jump:true});
  if(!w.bart.airborne||w.bart.maxSpeedX!==0x0200)throw new Error(`Plain Q jump incorrectly started fast: airborne=${w.bart.airborne} max=${w.bart.maxSpeedX.toString(16)}`);
  for(let i=0;i<3;i++)w.tick({...no,jump:true});
  w.tick({...no,right:true,jump:true});
  let guard=0;
  while(w.bart.airborne&&guard++<200)w.tick({...no,right:true,jump:true});
  if(w.bart.airborne)throw new Error("Plain Q jump never landed");
  if(w.bart.maxSpeedX!==0x0400||w.bart.animationReload!==1)throw new Error(`Q-held landing did not enter DOS run state: max=${w.bart.maxSpeedX.toString(16)} reload=${w.bart.animationReload}`);
  w.tick({...no,right:true,jump:true});
  if(w.bart.velocityX<=0x0200)throw new Error(`Delayed-right jump did not accelerate beyond walk cap after landing: vx=${w.bart.velocityX.toString(16)}`);
  w.tick({...no,right:true});
  if(w.bart.maxSpeedX!==0x0200||w.bart.animationReload!==3)throw new Error(`Releasing grounded Q did not reset walk state: max=${w.bart.maxSpeedX.toString(16)} reload=${w.bart.animationReload}`);
}

// Separate optional DOS path: Q+FIRE promotes to 0400h immediately at takeoff
// and consumes FIRE before the later weapon/action pass. It is not required
// for the normal jump->land->run transition above.
{
  const w=new RuntimeWorld(loadLevel(1));w.setCollisionsEnabled(false);
  w.collisionState.inventoryCounts[3]=1;w.collisionState.sprayMeter0815=0x1b;
  w.tick({...no,right:true});
  w.tick({...no,right:true,jump:true,action:true});
  if(!w.bart.airborne||w.bart.maxSpeedX!==0x0400)throw new Error(`Q+FIRE optional fast-jump state wrong: airborne=${w.bart.airborne} max=${w.bart.maxSpeedX.toString(16)}`);
  if(w.collisionState.inventory.actionActive||w.collisionState.inventory.actionHitbox)throw new Error("Q+FIRE incorrectly fired weapon on jump-start tick");
}

// Special static terrain bounce uses the forced 09h hold phase at -0580h.
{
  const w=new RuntimeWorld(loadLevel(1));w.setCollisionsEnabled(false);
  w.bart.y=100;w.bartPlayer.bounce(-0x0580,"smoke special terrain");
  if(w.bart.jumpHoldCounter!==9)throw new Error(`Special bounce counter not 09h: ${w.bart.jumpHoldCounter}`);
  for(let i=0;i<10;i++)w.tick(no);
  if(w.bart.y>40)throw new Error(`Special bounce did not preserve high no-gravity ascent: y=${w.bart.y}`);
}

// Viewer immunity is not the DOS blink timer and does not mutate damage state.
{
  const w=new RuntimeWorld(loadLevel(1));w.setCollisionsEnabled(false);
  w.setDebugInvulnerable(true);
  if(w.bartPlayer.takeHit("should be blocked"))throw new Error("Viewer invulnerability accepted a hit");
  if(w.bart.invulnerabilityTimer!==0||w.bart.hitDeathTimer!==0)throw new Error("Viewer invulnerability polluted DOS damage timers");
  w.reset();
  if(!w.isDebugInvulnerable())throw new Error("Viewer invulnerability did not persist across reset");
}

// COWABUNGA and -EATMYSHORTS both skip the lives decrement after death.
for(const which of ["cow","eat"]){
  const w=new RuntimeWorld(loadLevel(1));w.setCollisionsEnabled(false);
  if(which==="cow")w.activateCowabungaCheat();else w.activateEatMyShortsCheat();
  w.hud.healthCounter=0;w.bart.hitDeathTimer=1;w.bart.invulnerabilityTimer=0;w.bart.x=777;
  w.tick(no);
  if(w.hud.livesRemaining!==3||w.healthPoints!==2||w.bart.x!==w.level.playerConfig.start_x)throw new Error(`${which} unlimited-lives respawn wrong: lives=${w.hud.livesRemaining} hp=${w.healthPoints} x=${w.bart.x}`);
}
{
  const w=new RuntimeWorld(loadLevel(1));
  if(w.triggerEatMyShortsLevelSkip())throw new Error("F level skip worked without -EATMYSHORTS");
  w.activateEatMyShortsCheat();
  if(!w.triggerEatMyShortsLevelSkip()||!w.levelFinished)throw new Error("-EATMYSHORTS F did not set level-finished flag");
}
console.log("DOS controls/cheats smoke: Q-held landing run (direction may start airborne), optional Q+Space fast start, 09h/-0580h bounce, viewer immunity and DOS cheats OK");
