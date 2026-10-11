import type { NativeCallResult } from "../ScriptVm.js";
import type {
  BartInputState,
  BartRuntime,
  CollisionGlobalRuntime,
  GameHudRuntime,
  GameObjectRuntime,
  GlobalEventRuntime,
  LoadedLevel,
  ScriptEdge,
  ScriptInstruction,
} from "../types.js";

export interface LevelInventoryItemUseEvent {
  itemId: number;
  bart: BartRuntime;
  itemCount(index: number): number;
  consumeItem(index: number): boolean;
  resetSelection(message: string): void;
  note(message: string): void;
}

export interface LevelChildSpawnedEvent {
  parent: GameObjectRuntime;
  child: GameObjectRuntime;
  globalEvent: GlobalEventRuntime | null;
}


export interface LevelBartPosition {
  x: number;
  y: number;
}

export interface LevelPlayerStepEvent {
  /** Exact browser-normalized input for this DOS gameplay tick. */
  input: BartInputState;
  tick: number;
  /** Bart position on entry to DOS UpdateBart/LevelSpecificPlayerDispatch. */
  previousBart: LevelBartPosition;
}

export type LevelBartActionMode = "normal" | "suppress-weapons" | "suppress-all";

export interface LevelPlayerStepResult {
  /**
   * DOS LevelSpecificPlayer_* routines can tail-jump into a completely
   * different movement implementation (Level 1 skateboard is the first
   * example). Returning false lets that level handler own the Bart update.
   */
  continueGenericBartUpdate: boolean;
  /** Mirrors level-owned gates around UpdateBartActionAndWeaponState. */
  bartActionMode?: LevelBartActionMode;
  /** Mirrors HUD/modal gates that skip UpdateInventorySelection. */
  suppressInventorySelection?: boolean;
}

export interface LevelInteractionOverlayOption {
  itemId: number;
  label: string;
  stock: number;
}

export interface LevelInteractionOverlay {
  kind: "shop";
  title: string;
  state: number;
  timer: number;
  selectedIndex: number;
  currencyLabel: string;
  currency: number;
  options: LevelInteractionOverlayOption[];
}

export interface LevelHudMeter {
  label: string;
  value: number;
  max: number;
}

/**
 * Narrow bridge from level-specific code back into the generic runtime.
 * Keeping this interface explicit makes Visual Studio "Find All References"
 * show every engine event that a level handler can influence.
 */
export interface LevelRuntimeServices {
  readonly level: LoadedLevel;
  readonly bart: BartRuntime;
  readonly hud: GameHudRuntime;
  readonly collisionState: CollisionGlobalRuntime;
  activateSourceRecord(offset: number | undefined, flags: number, mode?: "or" | "set"): boolean;
  sourceFlags(offset: number | undefined): number | null;
  sourceTypeOffset(offset: number | undefined): number | null;
  teleportBart(x: number): void;
  /** Generic DOS UpdateBartJumpState bridge for level-owned movement paths. */
  stepBartJumpState(input: BartInputState): void;
  /** Resolve the shared static-terrain landing path after level-owned motion. */
  resolveBartStaticTerrain(previousBart: LevelBartPosition, input: BartInputState): void;
  /** Re-resolve the Bart descriptor after a level handler selects a frame. */
  refreshBartSprite(): void;
  getCameraWorldX(): number;
  setCameraWorldX(value: number): void;
  /** Generic DOS AllocateTransientGraphicObject equivalent; returns runtime slot id. */
  allocateTransientGraphic(x: number, y: number, graphicOffset: number, segment?: number): number | null;
  clearTransientGraphic(runtimeId: number | null): void;
  setTransientGraphicOffset(runtimeId: number | null, graphicOffset: number, segment?: number): void;
  nextRandom(): number;
  getLevelFinished(): boolean;
  setLevelFinished(value: boolean): void;
}

export interface LevelHandlerSet {
  readonly level: number;
  initialize(): void;
  reset(): void;
  dispose(): void;
  beforePlayerStep(event: LevelPlayerStepEvent): LevelPlayerStepResult;
  handleInventoryItemUse(event: LevelInventoryItemUseEvent): boolean;
  handleNativeCall(object: GameObjectRuntime, instruction: ScriptInstruction, edges: ScriptEdge[], nextPc: number): NativeCallResult;
  onChildSpawned(event: LevelChildSpawnedEvent): void;
  getHudMeter(): LevelHudMeter | null;
  getInteractionOverlay(): LevelInteractionOverlay | null;
  /** Optional mapping for DOS common-overlay graphic pointers to exported frames. */
  resolveTransientGraphicDescriptor(graphicOffset: number): number | null;
}

export class EmptyLevelHandlers implements LevelHandlerSet {
  constructor(readonly level: number) {}
  initialize(): void {}
  reset(): void {}
  dispose(): void {}
  beforePlayerStep(_event: LevelPlayerStepEvent): LevelPlayerStepResult { return { continueGenericBartUpdate: true }; }
  handleInventoryItemUse(_event: LevelInventoryItemUseEvent): boolean { return false; }
  handleNativeCall(_object: GameObjectRuntime, _instruction: ScriptInstruction, _edges: ScriptEdge[], _nextPc: number): NativeCallResult {
    return { handled: false };
  }
  onChildSpawned(_event: LevelChildSpawnedEvent): void {}
  getHudMeter(): LevelHudMeter | null { return null; }
  getInteractionOverlay(): LevelInteractionOverlay | null { return null; }
  resolveTransientGraphicDescriptor(_graphicOffset: number): number | null { return null; }
}
