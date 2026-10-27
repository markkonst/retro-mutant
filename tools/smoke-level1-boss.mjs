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

const assert = (condition, message) => { if (!condition) throw new Error(message); };
const no = {left:false,right:false,jump:false,down:false,action:false};
const world = new RuntimeWorld(loadLevel(1));
world.setDebugInvulnerable(true);
Object.assign(world.bart, {x:0x30bc,y:122,facing:0});
world.tick(no);
assert(world.collisionState.inventory.bartActionState === 6, 'Arena must supply shot mode without inventory');
world.bart.facing = 1;
world.tick({...no,action:true});
assert(!world.collisionState.inventory.projectile, 'No left-facing boss shot');
world.bart.facing = 0;
world.tick({...no,action:true});
const first = world.collisionState.inventory.projectile;
assert(first?.typeOffset === 6 && first.descriptorIndex === 31, 'Use original reserved type-6 shot and frame');
assert(first.x === world.bart.x + 16 && first.velocityX === 0x800, 'Startup displacement and speed');
world.reset();
assert(world.collisionState.bossHitPoints === 10 && world.collisionState.collisionLatch0784 === 0, 'Reset boss state');
// Run the real Nelson script, without assigning HP, defeat latch or completion.
// Start inside the arena to isolate the fight from the still-unverified route.
Object.assign(world.bart, {x:0x3140,y:122,facing:0});
let sawBoss = false;
for (let tick=0; tick<5000 && !world.levelFinished; tick++) {
  world.tick({...no,action:true});
  sawBoss ||= world.collisionState.linkedTargetRuntimeId079D !== null;
}
assert(sawBoss, 'Nelson must stream in and register himself');
assert(world.collisionState.bossHitPoints === 0, `Ten shots should defeat Nelson: HP=${world.collisionState.bossHitPoints}`);
assert(world.levelFinished, 'Real Nelson death script must raise levelFinished');
// Helper damage uses a boss-relative rectangle, not Bart proximity.
const helperWorld = new RuntimeWorld(loadLevel(1));
helperWorld.setCollisionsEnabled(false);
const boss = helperWorld.debugEnsureSourceLoaded(125);
assert(boss, 'Boss source');
helperWorld.tick(no);
helperWorld.collisionState.linkedTargetRuntimeId079D = boss.runtimeId;
const helper = helperWorld.objects.find(o => !o.active);
Object.assign(helper, {active:true, x:boss.x, y:boss.y, sourceAttached:false,
  collision:helperWorld.level.collisionByType.get(86)});
helperWorld.collisionState.bossHitPoints = 2;
// Call the collision system directly: no VM rewrites this synthetic helper.
helperWorld.collisions.resolveObjectCollisions({x:0,y:0},new Map(),[boss,helper]);
assert(helperWorld.collisionState.bossHitPoints === -1, 'Helper subtracts three with signed arithmetic');
assert(helperWorld.collisionState.collisionLatch0784 === 255 && !helper.active, 'Helper defeat gate and removal');
console.log('Boss smoke: arena mode, facing gate, original projectile, ten-hit Nelson fight/death script and helper damage OK');

// A closed objective gate must stop forward movement but permit retreat.
// Reproduce normal streaming and input, without force-loading Nelson.
for (const completed of [false, true]) {
  const gateWorld = new RuntimeWorld(loadLevel(1));
  gateWorld.setDebugInvulnerable(true);
  if (completed) {
    // Isolate the gate transition; a complete objective route is a separate test.
    while (gateWorld.hud.goalsRemaining > 0) gateWorld.decrementGoals();
  }
  Object.assign(gateWorld.bart, { x: 12300, y: 122, groundY: 122 });
  for (let i = 0; i < 250; i++) gateWorld.tick({ ...no, right: true });
  const atGate = gateWorld.bart.x;
  const nelson = gateWorld.objects.find(o => o.active && o.typeId === 7);
  assert(Boolean(nelson) === completed, 'Nelson streams only after walking past the cleared gate');
  if (!completed) {
    assert(atGate === 12402 && gateWorld.bart.minX === 0, 'Closed gate must not enter arena mode');
  } else {
    assert(gateWorld.bart.minX === 0x30b7, 'Original Nelson arena sets a return boundary');
  }
  for (let i = 0; i < 250; i++) gateWorld.tick({ ...no, left: true });
  assert(gateWorld.bart.x < atGate - 20, 'Bart must be able to walk left away from the barrier');
  if (completed) assert(gateWorld.bart.x >= 0x30b7, 'Boss arena return boundary remains enforced');
}
console.log('Gate regression: closed gate allows retreat; cleared objectives allow Nelson and enforce arena bounds');
