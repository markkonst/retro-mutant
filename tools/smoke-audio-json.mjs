import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { extractBuzzer, extractAdlib, readBuzzerAsset, readAdlibAsset } from '../wwwroot/js/game/audio/SoundAssets.js';
import { decodeBuzzer, BuzzerDriver } from '../wwwroot/js/game/audio/BuzzerDriver.js';
const parse = value => JSON.parse(JSON.stringify(value));
// Synthetic OVL makes extraction/JSON round-trip coverage available without game assets.
const bytes=new Uint8Array(950);bytes.set([232,0,0,203,232,0,0,203]);
bytes[0x174]=100;
for(let id=0;id<19;id++){bytes[0x234+id*2]=0x5a;bytes[0x235+id*2]=2;}
bytes.set([2,255,0,255],0x25a);
const asset=parse(extractBuzzer(bytes));
assert.deepEqual(readBuzzerAsset(asset),decodeBuzzer(bytes));
asset.sounds[1].tones[0].divisor=200;
const driver=new BuzzerDriver(readBuzzerAsset(asset));driver.queue(1);driver.tick();
assert.equal(driver.tick(),200,'Playback must use JSON edits');
assert.throws(()=>readBuzzerAsset({...asset,version:2}),/version/);
asset.sounds[1].tones[0].delta=128;assert.throws(()=>readBuzzerAsset(asset),/tone/);
const folder='wwwroot/data/audio/';
if(existsSync(folder+'pc-speaker.json')) {
 const bank=readBuzzerAsset(JSON.parse(readFileSync(folder+'pc-speaker.json')));
 if(existsSync(folder+'BUZZER.OVL'))assert.deepEqual(bank,decodeBuzzer(readFileSync(folder+'BUZZER.OVL')));
}
if(existsSync(folder+'adlib.json')) {
 const a=JSON.parse(readFileSync(folder+'adlib.json'));
 const memory=readAdlibAsset(a);
 if(existsSync(folder+'ADLIB.OVL')) {
  const original=readFileSync(folder+'ADLIB.OVL');
  assert.deepEqual([...memory.slice(0x512,4077)],[...original.slice(0x512)]);
  assert.deepEqual(parse(extractAdlib(original)),a,'Extractor output must be reproducible');
 }
 const edited=parse(a);edited.fields.find(f=>f.name==='instrument[0].carrierVolume').values[0]^=1;
 assert.notDeepEqual(readAdlibAsset(edited),memory,'JSON instrument settings are authoritative');
 assert.throws(()=>readAdlibAsset({...a,version:2}),/version/);
 const duplicate=parse(a);duplicate.fields.push(duplicate.fields[0]);
 assert.throws(()=>readAdlibAsset(duplicate),/overlapping/);
 const missing=parse(a);missing.fields.pop();assert.throws(()=>readAdlibAsset(missing),/Incomplete/);
 const invalid=parse(a);invalid.fields[0].values[0]=256;assert.throws(()=>readAdlibAsset(invalid),/value/);
}
console.log('Audio JSON: extraction, round trip, editable playback data, version/range/overlap/completeness validation OK');
