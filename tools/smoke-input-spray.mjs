import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { RuntimeWorld } from "../wwwroot/js/game/RuntimeWorld.js";
const root=resolve(fileURLToPath(new URL("..",import.meta.url)));
function loadLevel(n){const d=join(root,"wwwroot","data",`level${n}`);const manifest=JSON.parse(readFileSync(join(d,"manifest.json")));const runtime=JSON.parse(readFileSync(join(d,"runtime_data.json")));const scripts=JSON.parse(readFileSync(join(d,"object_scripts.json")));const playerConfig=JSON.parse(readFileSync(join(d,"player_runtime.json")));let eventMessages={messages:[]};try{eventMessages=JSON.parse(readFileSync(join(d,"event_messages.json")));}catch{}return{level:n,manifest,runtime,scripts,playerConfig,eventMessages,eventMessageByKey:new Map((eventMessages.messages??[]).map(m=>[`${m.segment}:${m.offset}`,m])),background:{},descriptorByIndex:new Map(manifest.runtime.object_descriptors.map(x=>[x.index,x])),imageByDescriptorIndex:new Map(),bartDescriptorByIndex:new Map(manifest.runtime.bart_descriptors.map(x=>[x.index,x])),bartImageByDescriptorIndex:new Map(),flowByType:new Map(scripts.object_types.map(x=>[x.type_id,x])),collisionByType:new Map(runtime.collision_profiles.map(x=>[x.type_id,x]))};}
const appSource=readFileSync(join(root,"src/ui/App.ts"),"utf8");
for(const token of [
  'case "KeyO":\n          this.bartInput.left = false',
  'case "KeyP":\n          this.bartInput.right = false',
  'case "KeyQ":\n          this.bartInput.jump = false',
  'case "KeyA":\n          this.bartInput.down = false',
  'case "Space":\n          this.bartInput.action = false',
  'case "F8":',
  'window.addEventListener("blur", () => this.clearBartInput())',
]){
  if(!appSource.includes(token))throw new Error(`Keyboard regression missing: ${token}`);
}
const no={left:false,right:false,jump:false,down:false,action:false,inventory:false};
const w=new RuntimeWorld(loadLevel(1));w.setCollisionsEnabled(false);
w.collisionState.inventoryCounts[3]=1;w.collisionState.sprayMeter0815=0x1b;
w.tick({...no,action:true});
if(!w.collisionState.inventory.actionActive||!w.collisionState.inventory.actionHitbox)throw new Error("Spray FIRE did not activate action hitbox");
const visual0=w.collisionState.inventory.actionVisual;
if(!visual0||visual0.x!==w.bart.x+0x10||visual0.y!==w.bart.y+0x0a||visual0.descriptorIndex!==0)throw new Error(`Spray visual frame 0 wrong: ${JSON.stringify(visual0)}`);
w.tick({...no,action:true});
const visual1=w.collisionState.inventory.actionVisual;
if(!visual1||visual1.descriptorIndex!==1)throw new Error(`Spray visual did not toggle to descriptor 1: ${JSON.stringify(visual1)}`);
if(w.bart.animationBase!==0x18)throw new Error(`Bart spray base not applied: ${w.bart.animationBase}`);
// Critical v0.8 regression: the extra +18h action offset belongs only to the
// moving-animation path. Applying it to the idle path selects D64+ skateboard.
if(w.bart.spriteDescriptorId>=0x40)throw new Error(`Idle spray selected skateboard descriptor D${w.bart.spriteDescriptorId}`);
if(w.bart.spriteDescriptorId<0x28||w.bart.spriteDescriptorId>0x2f)throw new Error(`Idle spray descriptor outside weapon-idle group: D${w.bart.spriteDescriptorId}`);
const hit=w.collisionState.inventory.actionHitbox;
if(hit.y!==w.bart.y+0x0e)throw new Error(`Spray hitbox Y is not DOS BartY+0Eh: ${hit.y}/${w.bart.y}`);
const meter=w.collisionState.sprayMeter0815, count=w.collisionState.inventoryCounts[3];
for(let i=0;i<40;i++)w.tick(no);
if(w.collisionState.inventory.actionActive||w.collisionState.inventory.actionHitbox||w.collisionState.inventory.actionVisual)throw new Error("Spray remained active after FIRE release");
if(w.collisionState.sprayMeter0815!==meter||w.collisionState.inventoryCounts[3]!==count)throw new Error("Spray ammo drained after FIRE release");

// Moving FIRE path does receive the second +18h and must stay below the
// skateboard descriptor group (D64+).
for(let i=0;i<5;i++)w.tick({...no,right:true,action:true});
if(w.bart.spriteDescriptorId<0x30||w.bart.spriteDescriptorId>=0x40)throw new Error(`Moving spray descriptor wrong: D${w.bart.spriteDescriptorId}`);

// Visual gameplay regression: a Level-1 handler-15 target starts as type 15
// (descriptor 117) and, after its low-5 counter is sprayed down, becomes type
// 16 (descriptor 116). This is the pink/red state-change path reported by user.
const t=new RuntimeWorld(loadLevel(1));t.setCollisionsEnabled(true);
t.collisionState.inventoryCounts[3]=1;t.collisionState.sprayMeter0815=0x1b;
const target=t.debugEnsureSourceLoaded(0);
if(!target||target.typeId!==15)throw new Error("Expected Level-1 spray target source #0 type 15");
t.bart.x=65;t.bart.y=122;t.bart.facing=0;t.bart.velocityX=0;t.bart.airborne=false;
for(let i=0;i<36;i++)t.tick({...no,action:true});
if(target.typeId!==16)throw new Error(`Spray target did not transition 15->16: type=${target.typeId} flags=${target.flags.toString(16)}`);
for(let i=0;i<2;i++)t.tick(no);
if(target.descriptorIndex!==116)throw new Error(`Spray target type16 did not resolve descriptor 116: D${target.descriptorIndex}`);
console.log("Input/spray smoke: DOS O/P/Q/A/Space keyup map, held-FIRE drain, reserved spray sprite frames, no idle skateboard, moving action frames, exact hitbox and type15->16 visual transition OK");
