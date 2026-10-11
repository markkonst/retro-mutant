import type { LevelChildSpawnedEvent, LevelHudMeter, LevelRuntimeServices } from "../LevelHandlers.js";
import { LEVEL1_SPEECH_BUBBLE_TYPES } from "./Level1Constants.js";

/** Level-1 presentation bindings that sit on top of generic VM/object events. */
export class Level1PresentationHandlers {
  constructor(private readonly services: LevelRuntimeServices) {}

  /**
   * Common-overlay door records used by Level1SpecialSequence. The common
   * descriptor bank itself is not exported, but these frames are duplicates
   * of the recovered Level-1 door artwork in the object bank. State02 uses
   * the open pose; State0C repoints to the closed pose.
   */
  resolveTransientGraphicDescriptor(graphicOffset: number): number | null {
    switch (graphicOffset & 0xffff) {
      case 0x30a6: return 24; // shop 1 open
      case 0x30be: return 22; // shop 1 closed
      case 0x307a: return 27; // shops 2/3 open
      case 0x3092: return 25; // shops 2/3 closed
      default: return null;
    }
  }

  onChildSpawned(event: LevelChildSpawnedEvent): void {
    if (!LEVEL1_SPEECH_BUBBLE_TYPES.has(event.child.typeId)) return;
    event.child.eventTextSnapshot = event.globalEvent?.lines.slice() ?? null;
  }

  getHudMeter(): LevelHudMeter {
    return {
      label: "SPR",
      value: Math.max(0, Math.min(27, this.services.collisionState.sprayMeter0815)),
      max: 27,
    };
  }
}
