import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import OPL3 from 'opl3/lib/opl3.js';
import {AdlibSynth} from '../wwwroot/js/game/audio/AdlibSynth.js';
import {AdlibDriver} from '../wwwroot/js/game/audio/AdlibDriver.js';
assert.throws(()=>new AdlibDriver(new Uint8Array(4077),()=>{}),/Invalid AdLib JSON/);
const path='wwwroot/data/audio/adlib.json';
if(!existsSync(path)) { console.log('AdLib PCM test skipped: import original ADLIB.OVL to exercise it'); }
else {
 const synth=new AdlibSynth(JSON.parse(readFileSync(path)),new OPL3());
 let energy=0, peak=0,frames=0;
 for(let tick=0;tick<300;tick++) {
  if(tick%15===0)synth.driver.queueSound(tick/15%18+1);
  const samples=synth.renderTick();frames+=samples.length/2;
  for(const sample of samples){assert(Number.isFinite(sample));energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
 }
 assert(energy>0.1 && peak>0.001,'Music/effects must produce non-silent PCM');
 assert(peak<=1,'No clipped float samples');
 console.log(`AdLib PCM: ${frames} stereo frames, peak=${peak.toFixed(3)}, non-silent music and SFX`);
}
