import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { extractBuzzer, extractAdlib, readAdlibAsset } from '../wwwroot/js/game/audio/SoundAssets.js';

const folder = process.argv[2];
if (!folder) throw new Error('Usage: npm run import-sound -- <original DOS game folder>');
const speaker = extractBuzzer(await readFile(join(resolve(folder), 'BUZZER.OVL')));
let adlib;
try {
  adlib = extractAdlib(await readFile(join(resolve(folder), 'ADLIB.OVL')));
  readAdlibAsset(adlib); // Validate the serialized layout before replacing outputs.
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const destination = resolve('wwwroot/data/audio');
await mkdir(destination, { recursive: true });
await writeFile(join(destination, 'pc-speaker.json'), JSON.stringify(speaker, null, 2) + '\n');
if (adlib) await writeFile(join(destination, 'adlib.json'), JSON.stringify(adlib, null, 2) + '\n');
console.log(`Extracted 19 PC-speaker effects${adlib ? ' and AdLib instruments/music/effects' : ''} to readable JSON in wwwroot/data/audio. No OVL is needed by the browser.`);
