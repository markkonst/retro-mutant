import type { NativeCallResult } from "../../ScriptVm.js";
import type { GameObjectRuntime, ScriptEdge, ScriptInstruction } from "../../types.js";
import type { LevelChildSpawnedEvent, LevelHandlerSet, LevelHudMeter, LevelInteractionOverlay, LevelInventoryItemUseEvent, LevelPlayerStepEvent, LevelPlayerStepResult, LevelRuntimeServices } from "../LevelHandlers.js";
import { Level1InventoryHandlers } from "./Level1InventoryHandlers.js";
import { Level1NativeHandlers } from "./Level1NativeHandlers.js";
import { Level1PresentationHandlers } from "./Level1PresentationHandlers.js";
import { Level1PlayerHandlers } from "./Level1PlayerHandlers.js";
import { Level1ShopHandlers } from "./Level1ShopHandlers.js";

/** Composition root for all currently modeled Level-1-only behavior. */
export class Level1Handlers implements LevelHandlerSet {
  readonly level = 1;
  private readonly inventory: Level1InventoryHandlers;
  private readonly natives: Level1NativeHandlers;
  private readonly presentation: Level1PresentationHandlers;
  private readonly player: Level1PlayerHandlers;
  private readonly shop: Level1ShopHandlers;

  constructor(services: LevelRuntimeServices) {
    this.inventory = new Level1InventoryHandlers(services);
    this.natives = new Level1NativeHandlers(services);
    this.presentation = new Level1PresentationHandlers(services);
    this.shop = new Level1ShopHandlers(services);
    this.player = new Level1PlayerHandlers(services, this.shop);
  }

  initialize(): void { this.shop.reset(); this.player.reset(); this.natives.reset(); }
  reset(): void { this.shop.reset(); this.player.reset(); this.natives.reset(); }
  dispose(): void { this.natives.dispose(); }
  beforePlayerStep(event: LevelPlayerStepEvent): LevelPlayerStepResult { return this.player.beforePlayerStep(event); }
  handleInventoryItemUse(event: LevelInventoryItemUseEvent): boolean { return this.inventory.handleInventoryItemUse(event); }
  handleNativeCall(object: GameObjectRuntime, instruction: ScriptInstruction, edges: ScriptEdge[], nextPc: number): NativeCallResult {
    return this.natives.handleNativeCall(object, instruction, edges, nextPc);
  }
  onChildSpawned(event: LevelChildSpawnedEvent): void { this.presentation.onChildSpawned(event); }
  getHudMeter(): LevelHudMeter { return this.presentation.getHudMeter(); }
  getInteractionOverlay(): LevelInteractionOverlay | null { return this.shop.getOverlay(); }
  resolveTransientGraphicDescriptor(graphicOffset: number): number | null { return this.presentation.resolveTransientGraphicDescriptor(graphicOffset); }
}
