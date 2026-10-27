import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {AdlibDriver} from '../wwwroot/js/game/audio/AdlibDriver.js';
const [driverPath,tracePath]=process.argv.slice(2);
if(!tracePath)throw new Error('Usage: node tools/check-adlib-oracle.mjs adlib.json local-trace.json');
const trace=JSON.parse(readFileSync(tracePath));
let writes=[];
const driver=new AdlibDriver(JSON.parse(readFileSync(driverPath)),(r,v)=>writes.push([r,v]));
for(let tick=0;tick<trace.length;tick++) {
 const expected=trace[tick];
 if(expected.music!==null)driver.queueMusic(expected.music);
 if(expected.sound!==null)driver.queueSound(expected.sound);
 writes=[];driver.tick();
 assert.deepEqual(writes,expected.writes,`OPL writes tick ${tick}`);
 assert.deepEqual([...driver.memory.slice(0x512,0x5c6)],expected.voices,`Voice memory tick ${tick}`);
 assert.equal(driver.memory[12],expected.clock,`Music clock tick ${tick}`);
}
console.log(`AdLib: exact OPL writes, voice state and clock match original x86 across ${trace.length} ticks`);
