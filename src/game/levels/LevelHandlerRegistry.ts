import type { NativeCallResult } from "../ScriptVm.js";
import type { GameObjectRuntime, LoadedLevel, ScriptEdge, ScriptInstruction } from "../types.js";
import { EmptyLevelHandlers, type LevelChildSpawnedEvent, type LevelHandlerSet, type LevelHudMeter, type LevelInteractionOverlay, type LevelInventoryItemUseEvent, type LevelPlayerStepEvent, type LevelPlayerStepResult, type LevelRuntimeServices } from "./LevelHandlers.js";
import { Level1Handlers } from "./level1/Level1Handlers.js";

/**
 * Owns exactly one level-specific handler set. load() always unloads the old
 * set first, so level changes cannot leave native/inventory/spawn callbacks
 * from the previous level registered in the runtime.
 */
export class LevelHandlerRegistry {
  private active: LevelHandlerSet | null = null;

  load(level: LoadedLevel, services: LevelRuntimeServices): void {
    this.unload();
    this.active = level.level === 1
      ? new Level1Handlers(services)
      : new EmptyLevelHandlers(level.level);
    this.active.initialize();
  }

  reset(): void { this.active?.reset(); }

  unload(): void {
    this.active?.dispose();
    this.active = null;
  }

  beforePlayerStep(event: LevelPlayerStepEvent): LevelPlayerStepResult {
    return this.active?.beforePlayerStep(event) ?? { continueGenericBartUpdate: true };
  }

  handleInventoryItemUse(event: LevelInventoryItemUseEvent): boolean {
    return this.active?.handleInventoryItemUse(event) ?? false;
  }

  handleNativeCall(object: GameObjectRuntime, instruction: ScriptInstruction, edges: ScriptEdge[], nextPc: number): NativeCallResult {
    return this.active?.handleNativeCall(object, instruction, edges, nextPc) ?? { handled: false };
  }

  onChildSpawned(event: LevelChildSpawnedEvent): void { this.active?.onChildSpawned(event); }
  getHudMeter(): LevelHudMeter | null { return this.active?.getHudMeter() ?? null; }
  getInteractionOverlay(): LevelInteractionOverlay | null { return this.active?.getInteractionOverlay() ?? null; }
  resolveTransientGraphicDescriptor(graphicOffset: number): number | null { return this.active?.resolveTransientGraphicDescriptor(graphicOffset) ?? null; }
  get activeLevel(): number | null { return this.active?.level ?? null; }
}
