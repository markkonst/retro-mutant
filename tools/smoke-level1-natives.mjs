import { Level1NativeHandlers } from "../wwwroot/js/game/levels/level1/Level1NativeHandlers.js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Every decoded Level-1 FAR native must have an explicit typed handler case.
const decoded=JSON.parse(readFileSync(resolve("wwwroot/data/level1/object_scripts.json"),"utf8"));
const handlerSource=readFileSync(resolve("src/game/levels/level1/Level1NativeHandlers.ts"),"utf8");
const decodedNames=new Set();
for(const type of decoded.object_types) for(const ins of type.instructions) if(ins.name==="CallNativeFar"&&typeof ins.args?.name==="string") decodedNames.add(ins.args.name);
for(const name of decodedNames) if(!handlerSource.includes(`case "${name}"`)) throw new Error(`Decoded Level-1 native lacks explicit handler: ${name}`);

const collisionState={collisionLatch0784:0,linkedTargetRuntimeId079D:null};
let sourceType=0x84;
const randomValues=[];
const services={
  bart:{x:0}, hud:{levelTimer:999}, collisionState,
  nextRandom:()=>randomValues.shift()??0,
  getLevelFinished:()=>false, setLevelFinished:()=>{},
  sourceTypeOffset:(offset)=>offset===0x599?sourceType:null,
};
const h=new Level1NativeHandlers(services);
const o={runtimeId:7,flags:0,linkField2A:0,runtimeFlags:0,x:0,velocityX:0,accelerationY:0};
const call=(name,pc,edges,nextPc=pc+6)=>h.handleNativeCall(o,{pc,pc_hex:pc.toString(16),name:"CallNativeFar",args:{name}},edges,nextPc);

let r=call("Level1Native_SetObjectLinkField2A",0x2003,[{from:0x2003,to:0x200b,kind:"native_relative_redirect",detail:"SI += 2"}]);
if(o.linkField2A!==0x64||r.targetPc!==0x200b)throw new Error(`SetObjectLinkField2A mismatch ${o.linkField2A}/${r.targetPc}`);
const toggleEdges=[
  {from:0x200f,to:0x2015,kind:"native_fallthrough",detail:"SI += 0"},
  {from:0x200f,to:0x2019,kind:"native_relative_redirect",detail:"SI += 4"},
];
for(let i=0;i<99;i++){
  r=call("Level1Native_ToggleFlag1000AndCountdownField2A",0x200f,toggleEdges);
  if(r.targetPc!==0x2015)throw new Error(`countdown ended early at ${i}: ${r.targetPc}`);
}
r=call("Level1Native_ToggleFlag1000AndCountdownField2A",0x200f,toggleEdges);
if(o.linkField2A!==0||r.targetPc!==0x2019)throw new Error(`countdown terminal mismatch ${o.linkField2A}/${r.targetPc}`);

r=call("Level1Native_RegisterCurrentObjectAsBoss",0x2346,[],0x234c);
if(collisionState.linkedTargetRuntimeId079D!==7||r.targetPc!==0x234c)throw new Error("RegisterCurrentObjectAsBoss failed");

const typeEdges=[
  {from:0x2c63,to:0x2c69,kind:"native_fallthrough",detail:"SI += 0"},
  {from:0x2c63,to:0x2c6d,kind:"native_relative_redirect",detail:"SI += 4"},
];
r=call("Level1Native_BranchIfType67AtRecord0599",0x2c63,typeEdges);
if(r.targetPc!==0x2c69)throw new Error("type66 should fall through");
sourceType=0x86;
r=call("Level1Native_BranchIfType67AtRecord0599",0x2c63,typeEdges);
if(r.targetPc!==0x2c6d)throw new Error("type67 should redirect +4");

const nelsonEdges=[
  {from:0x2354,to:0x235a,kind:"native_fallthrough",detail:"SI += 0"},
  {from:0x2354,to:0x23a8,kind:"native_absolute_redirect",detail:null},
  {from:0x2354,to:0x235e,kind:"native_relative_redirect",detail:"SI += 4"},
];
randomValues.push(1);
r=call("Level1Native_NelsonChooseAttackOrDeath",0x2354,nelsonEdges);
if(r.targetPc!==0x235e)throw new Error(`Nelson random attack redirect mismatch ${r.targetPc}`);
collisionState.collisionLatch0784=0xff;
r=call("Level1Native_NelsonChooseAttackOrDeath",0x2354,nelsonEdges);
if(r.targetPc!==0x23a8)throw new Error(`Nelson death redirect mismatch ${r.targetPc}`);

console.log("Level-1 native smoke: link/countdown, boss register, type67 branch and Nelson branch semantics OK");
