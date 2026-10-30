import { BartRuntime, GameObjectRuntime } from "./types.js";

export type SceneSprite = { kind: "bart"; value: BartRuntime } | { kind: "object"; value: GameObjectRuntime };

/**
 * VGA.OVL:18EF calls four object passes around the separate Bart draw.
 * These are authored layers, not a sort by Y, sprite height or object type.
 * 1000h suppresses drawing; 0200h and 2000h select the object pass.
 */
export function objectRenderPass(flags: number): number | null {
  if (flags === 0 || (flags & 0x1000) !== 0) return null;
  switch (flags & 0x2200) {
    case 0x0000: return 0; // VGA:1A2B: ordinary object bank
    case 0x0200: return 1; // VGA:1B50: second object-bank pass
    case 0x2000: return 2; // VGA:1C85: common/Bart-bank scenery behind Bart
    default: return 4;    // VGA:1DBA: common/Bart-bank scenery in front of Bart
  }
}

/** Preserve physical DOS slot order within each pass without moving game slots. */
export function sceneDrawOrder(objects: readonly GameObjectRuntime[], bart: BartRuntime): SceneSprite[] {
  const passes: SceneSprite[][] = [[], [], [], [{ kind: "bart", value: bart }], []];
  for (const object of [...objects].sort((a, b) => a.slotIndex - b.slotIndex)) {
    if (!object.active) continue;
    const pass = objectRenderPass(object.flags);
    if (pass !== null) passes[pass]!.push({ kind: "object", value: object });
  }
  return passes.flat();
}
