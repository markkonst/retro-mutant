import { extractBuzzer } from "../wwwroot/js/game/audio/SoundAssets.js";

import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import {BuzzerDriver, decodeBuzzer} from '../wwwroot/js/game/audio/BuzzerDriver.js';
import {BrowserSound} from '../wwwroot/js/game/audio/BrowserSound.js';
// Synthetic notes exercise interpreter behavior without distributing game data.
const bank = [[], [{duration:2,divisor:100,delta:-3},{duration:1,divisor:200,delta:1}],
  [{duration:2,divisor:0,delta:-1}], [{duration:0,divisor:100,delta:0}]];
const driver = new BuzzerDriver(bank);
driver.queue(1);
assert.deepEqual(Array.from({length:6},()=>driver.tick()),[null,100,97,97,200,null]);
driver.queue(1); driver.tick(); driver.tick(); driver.queue(1);
assert.equal(driver.tick(),100,'Repeated same ID restarts, retaining old pitch during load');
assert.equal(driver.tick(),100);
driver.queue(1); driver.queue(2);
assert.deepEqual([driver.tick(),driver.tick(),driver.tick(),driver.tick()],[100,0,65535,null]);
driver.queue(3); assert.equal(driver.tick(),null); assert.equal(driver.tick(),null);
driver.queue(1); driver.tick(); driver.queue(255); assert.equal(driver.tick(),null);
assert.throws(()=>driver.queue(19),RangeError);
assert.throws(()=>decodeBuzzer(new Uint8Array(950)),/Unsupported/);
const bytes = new Uint8Array(950);
bytes.set([0xe8,0,0,0xcb,0xe8,0,0,0xcb]);
for(let i=0;i<19;i++){ bytes[0x234+i*2]=0x5a;bytes[0x235+i*2]=2; }
bytes[0x25a]=255;
assert.equal(decodeBuzzer(bytes).length,19);
bytes[0x25a]=1;bytes[0x25c]=96;
assert.throws(()=>decodeBuzzer(bytes),/pitch/);
if(existsSync('wwwroot/data/audio/BUZZER.OVL')) {
  const original = new BuzzerDriver(decodeBuzzer(readFileSync('wwwroot/data/audio/BUZZER.OVL')));
  for(let id=1;id<19;id++) {
    original.reset(); original.queue(id);
    const ticks=Array.from({length:10000},()=>original.tick());
    assert.equal(ticks.at(-1),null,`Sound ${id} must end`);
    assert(ticks.every(v=>v===null || (v>=0&&v<=65535)));
  }
}
// Browser adapter: fake only the platform, retain actual decoding and scheduling.
const calls=[];
const parameter=()=>({value:0,setValueAtTime:(v,t)=>calls.push([v,t]),cancelScheduledValues:()=>{}});
globalThis.AudioContext=class {
  currentTime=1;sampleRate=48000;destination={};
  resume(){return Promise.resolve();}
  createGain(){return {gain:parameter(),connect(){}};}
  createOscillator(){return {frequency:parameter(),connect(){},start(){}};}
};
bytes[0x25a]=255;
globalThis.fetch=async()=>({ok:true,json:async()=>extractBuzzer(bytes)});
const browser=new BrowserSound();await browser.enable("buzzer");assert(browser.enabled);
browser.queue(1);browser.schedule();browser.silence();browser.disable();assert(!browser.enabled);
assert(calls.length>0,'Web Audio parameters scheduled');
globalThis.fetch=async()=>({ok:false});
await assert.rejects(()=>new BrowserSound().enable("buzzer"),/Import BUZZER/);
console.log('Audio smoke: record-load tick, signed sweep/wrap, mailbox/retrigger/stop, malformed data, original bank and Web Audio lifecycle OK');
