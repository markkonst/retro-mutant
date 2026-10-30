import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {objectRenderPass,sceneDrawOrder} from '../wwwroot/js/game/RenderOrder.js';
import {WorldViewer} from '../wwwroot/js/game/WorldViewer.js';

// Independent transcription of the four VGA pass predicates, in call order.
for(let flags=1;flags<=0xffff;flags++) {
 const passes=[];
 if(!(flags&0x3200)) passes.push(0);
 if(!(flags&0x1000)&&(flags&0x200)&&!(flags&0x2000)) passes.push(1);
 if(!(flags&0x1000)&&!(flags&0x200)&&(flags&0x2000)) passes.push(2);
 if(!(flags&0x1000)&&(flags&0x200)&&(flags&0x2000)) passes.push(4);
 assert.equal(objectRenderPass(flags),passes[0]??null,flags.toString(16));
}
const sources=JSON.parse(readFileSync('wwwroot/data/level1/runtime_data.json','utf8')).object_sources;
assert.equal(objectRenderPass(sources.find(s=>s.index===0).flags),2,'first bin is behind Bart');
for(const index of [17,44]) assert.equal(objectRenderPass(sources.find(s=>s.index===index).flags),4,'later bins are in front');

// Exercise the actual compositor with opaque, overlapping stand-in sprites.
// The last drawn sprite owns the overlap pixel, regardless of position/height.
globalThis.window={devicePixelRatio:1};
const bart={renderVisible:true};
const objects=[
 {active:true,flags:0xa21f,slotIndex:2,source:{index:17},x:100,y:20},
 {active:true,flags:0x8000,slotIndex:5,source:{index:1},x:100,y:150},
 {active:true,flags:0xa01f,slotIndex:0,source:{index:0},x:100,y:30},
 {active:true,flags:0x8200,slotIndex:1,source:{index:2},x:100,y:1},
 {active:true,flags:0xb21f,slotIndex:4,source:{index:3}},
 {active:false,flags:0xa21f,slotIndex:3,source:{index:4}},
];
const original=[...objects];
assert.deepEqual(sceneDrawOrder(objects,bart).map(s=>s.kind==='bart'?'bart':s.value.source.index),[1,2,0,'bart',17]);
assert.deepEqual(objects,original,'rendering must not reorder the runtime pool');
const drawn=[];
const viewer=Object.create(WorldViewer.prototype);
Object.assign(viewer,{
 ctx:new Proxy({}, {get:()=>()=>{}}),canvas:{clientWidth:320,clientHeight:200},cameraX:0,
 level:{background:{width:320}},world:{objects,bart,collisionState:{inventory:{alternateGraphicsTimer:0}}},
 options:{zoom:1},dosHud:{draw(){}},
 drawSpecialBackgroundRemaps(){},drawObject(o){drawn.push(o.source.index)},drawBart(){drawn.push('bart')},
 drawInventoryTransients(){},drawEventSpeech(){},drawStatueMessage(){},
});
viewer.render();
assert.deepEqual(drawn,[1,2,0,'bart',17]);
let picked;
viewer.canvas.getBoundingClientRect=()=>({left:0,top:0});
viewer.objectScreenRect=viewer.bartScreenRect=()=>({left:0,right:20,top:0,bottom:20});
viewer.selectSource=index=>{picked=index};viewer.selectBart=()=>{picked='bart'};
viewer.selectAtClientPoint(10,10);
assert.equal(picked,17,'front bin wins hit testing');
objects[0].active=false;
viewer.selectAtClientPoint(10,10);
assert.equal(picked,'bart','Bart wins over background bin');
console.log('Render order: all VGA flag combinations, real bin placements, canvas composition and selection OK');
