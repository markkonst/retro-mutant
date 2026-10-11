import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLISION_HANDLER_INFO } from "../wwwroot/js/game/CollisionSystem.js";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const expectedOffsets = [
  0x0000, 0x6650, 0x6618, 0x66f1, 0x6bfd, 0x6cec, 0x6817, 0x65dc, 0x65b5, 0x66ce,
  0x6895, 0x6d38, 0x6dc6, 0x66dc, 0x667a, 0x68de, 0x697d, 0x6a07, 0x69ad, 0x65c4,
  0x6e50, 0x6b87, 0x6e70, 0x6b47, 0x6480, 0x6a6d, 0x6ac7, 0x5fbd, 0x6054, 0x6086,
  0x617b, 0x60d6, 0x60ab, 0x6090, 0x61db, 0x62dd, 0x6338, 0x63c6, 0x6258, 0x612e,
  0x619f, 0x61f8, 0x6440,
];

for (let index = 0; index < 43; index++) {
  const info = COLLISION_HANDLER_INFO[index];
  if (!info) throw new Error(`Missing collision handler table entry ${index}`);
  if (info.dosOffset !== expectedOffsets[index]) {
    throw new Error(`Handler ${index}: DOS offset mismatch ${info.dosOffset.toString(16)} != ${expectedOffsets[index].toString(16)}`);
  }
}
if (Object.keys(COLLISION_HANDLER_INFO).length !== 43) {
  throw new Error(`Expected exactly 43 handler entries, got ${Object.keys(COLLISION_HANDLER_INFO).length}`);
}

const used = new Set();
for (let level = 1; level <= 5; level++) {
  const runtime = JSON.parse(readFileSync(join(root, "wwwroot", "data", `level${level}`, "runtime_data.json"), "utf8"));
  for (const profile of runtime.collision_profiles) {
    const index = profile.collision_index;
    if (index === 0) continue;
    used.add(index);
    if (!COLLISION_HANDLER_INFO[index]) {
      throw new Error(`L${level} type ${profile.type_id}: unknown collision handler ${index}`);
    }
  }
}

const implemented = Object.values(COLLISION_HANDLER_INFO).filter((entry) => entry.fidelity === "implemented").length;
const partial = Object.values(COLLISION_HANDLER_INFO).filter((entry) => entry.fidelity === "partial").length;
const deferred = Object.values(COLLISION_HANDLER_INFO).filter((entry) => entry.fidelity === "deferred").length;
console.log(`Collision matrix smoke: 43/43 entries, ${used.size} indices used by level data; implemented=${implemented}, partial=${partial}, deferred=${deferred}`);
