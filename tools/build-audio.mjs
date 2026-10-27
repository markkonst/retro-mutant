// Copy the npm-provided browser bundle into generated (Git-ignored) output.
// Never copy original game assets here. See THIRD_PARTY_AUDIO.md for attribution.
import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('wwwroot/js/vendor',{recursive:true});
await copyFile('node_modules/opl3/dist/opl3.js','wwwroot/js/vendor/opl3.js');
