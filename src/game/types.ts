export type LevelNumber = 1 | 2 | 3 | 4 | 5;

export interface SpriteDescriptor {
  index: number;
  source_offset: number;
  width_units: number;
  height_pixels: number;
  x_offset: number;
  y_offset: number;
  unknown_0a: number;
  width_pixels: number;
  source_x: number;
  source_y: number;
}

export interface LevelObjectSource {
  index: number;
  offset: number;
  stream_x: number;
  x: number;
  y: number;
  type_offset: number;
  flags: number;
  type_id: number;
}

export interface CollisionProfile {
  type_id: number;
  offset: number;
  handler_table_offset: number;
  x_offset: number;
  width: number;
  y_offset: number;
  height: number;
  parameter: number;
  collision_index: number;
}

export interface StaticTerrain {
  index: number;
  offset: number;
  x1: number;
  x2: number;
  y_and_flags: number;
  surface_y: number;
  bounce: boolean;
}

export interface RuntimeDataJson {
  level: number;
  segment: string;
  object_sources: LevelObjectSource[];
  collision_profiles: CollisionProfile[];
  static_terrain: StaticTerrain[];
}

export interface ManifestJson {
  source_name: string;
  layout: {
    AX_map_paragraph: number;
    BX_tiles_paragraph: number;
    CX_object_sprites_paragraph: number;
    DX_bart_sprites_paragraph: number;
    map_start: number;
    object_sprites_start: number;
    bart_sprites_start: number;
    tiles_start: number;
    image_size: number;
  };
  map: {
    columns: number;
    rows: number;
    world_width_pixels: number;
    world_height_pixels: number;
    max_tile_id: number;
    unique_tile_ids: number;
  };
  runtime: {
    segment: string;
    object_descriptor_count: number;
    object_descriptors: SpriteDescriptor[];
    bart_descriptor_count: number;
    bart_descriptors: SpriteDescriptor[];
    palette_A?: {
      adapter_map: number[];
      rgb6: number[][];
    };
  };
}

export interface ScriptInstruction {
  pc: number;
  pc_hex: string;
  opcode: number;
  opcode_hex: string;
  name: string;
  size: number;
  raw_hex: string;
  args: Record<string, unknown>;
}

export interface ScriptEdge {
  from: number;
  from_hex: string;
  to: number | null;
  to_hex: string | null;
  kind: string;
  detail: string | null;
}

export interface ObjectTypeFlow {
  type_id: number;
  type_offset: number;
  entry_offset: number;
  entry_hex: string;
  instructions: ScriptInstruction[];
  edges: ScriptEdge[];
  referenced_object_descriptor_indices: number[];
}

export interface ObjectScriptsJson {
  level: number;
  segment: string;
  object_types: ObjectTypeFlow[];
}

export interface BartPlayerConfig {
  level: number;
  source: string;
  level_segment: string;
  camera_max_x: number;
  bart_max_x: number;
  ground_y_default: number;
  start_x: number;
  variant: number;
  initial_max_speed_x_fixed_8_8: number;
  initial_animation_reload: number;
  /** LevelRuntimeConfig +0Eh, copied by DOS init to g_GoalsRemainingBCD. */
  initial_goals_bcd: number;
  /** Recovered LevelRuntimeConfig source pointers used by inventory/global mechanics. */
  goal_gate_source_offset?: number;
  progress_source_offset?: number;
  inventory_item8_source_offset?: number;
  inventory_item6_source_offset?: number;
}

export interface BartInputState {
  left: boolean;
  right: boolean;
  jump: boolean;
  /** DOS gameplay input bit 02h (down). */
  down?: boolean;
  /** Viewer binding for the DOS FIRE/action bit (80h). */
  action?: boolean;
  /** Viewer binding for the recovered inventory-mode input. */
  inventory?: boolean;
}

export interface InventoryItemDefinition {
  id: number;
  name: string;
  iconOffset: number;
  nameOffset: number;
}

export interface InventoryProjectileRuntime {
  active: boolean;
  kind: "cherry-bomb" | "rocket" | "donut" | "slingshot" | "dart";
  typeOffset: number;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  accelerationY: number;
  lifetime: number;
  /** Optional decoded object-frame surrogate for a DOS common-overlay graphic. */
  descriptorIndex?: number;
  /** Optional second frame used by the common-overlay animation. */
  alternateDescriptorIndex?: number;
  animationPeriod?: number;
}


export interface BartActionHitboxRuntime {
  active: boolean;
  left: number;
  right: number;
  y: number;
}

export interface BartActionVisualRuntime {
  active: boolean;
  /** Reserved DS:0EB7 action-object anchor in world coordinates. */
  x: number;
  y: number;
  /** Object descriptor selected by the recovered 0/0Ch/18h/24h render offsets. */
  descriptorIndex: number;
}

export interface InventoryRuntime {
  /** DS:07DF. */
  selectedItem: number;
  /** DS:07D7. */
  modeHeld: boolean;
  /** DS:07D6. */
  repeatTimer: number;
  /** DS:07DD. */
  displayTimeout: number;
  /** DS:07DE. Non-zero while X-RAY/alternate graphics are enabled. */
  alternateGraphicsTimer: number;
  /** DS:07AD. */
  bartActionState: number;
  /** DS:083A / 0841 high-level equivalents. */
  actionActive: boolean;
  actionCooldown: number;
  /** DS:0816 spray sub-divider. */
  spraySubCounter0816: number;
  /** DS:081F Level-3 magnet trigger. */
  magnetTrigger081F: number;
  /** Recovered secondary/action collision shape used by handler 15. */
  actionHitbox: BartActionHitboxRuntime | null;
  /** Visual half of the same reserved DS:0EB7 spray action object. */
  actionVisual: BartActionVisualRuntime | null;
  /** High-level equivalent of the reserved transient object at DS:0E87. */
  projectile: InventoryProjectileRuntime | null;
  transientObjects: InventoryProjectileRuntime[];
  pauseRequested: boolean;
  lastAction: string | null;
  lastSoundId: number | null;
}

export type BartSupportKind = "ground" | "terrain" | "object" | "none";

export interface BartRuntime {
  x: number;
  y: number;
  groundY: number;
  supportY: number;
  supportKind: BartSupportKind;
  supportSourceIndex: number | null;
  /** DOS g_WorldMinXBound (078Bh), changed by SetLevelCameraState. */
  minX: number;
  maxX: number;
  velocityX: number;
  velocityY: number;
  maxSpeedX: number;
  facing: 0 | 1;
  airborne: boolean;
  jumpHoldCounter: number;
  brakeIdleState: number;
  idleTimer: number;
  idleAnimCounter: number;
  animationBase: number;
  animationFrame: number;
  animationTimer: number;
  animationReload: number;
  spriteDescriptorId: number;
  descriptor: SpriteDescriptor | null;
  image: HTMLImageElement | null;
  hitDeathTimer: number;
  invulnerabilityTimer: number;
  blinkPhase: number;
  renderVisible: boolean;
  collisionCount: number;
  lastCollision: string | null;
}

export interface CollisionGlobalRuntime {
  /** DS:0766 progression index used by several progression collision handlers. */
  levelProgress0766: number;
  /** DS:0768 byte-offset into the nine-word airborne pattern table. */
  patternState0768: number;
  /** DS:076A sequence counter (0,4,...,1Ch). */
  sequenceCounter076A: number;
  /** DS:076C word toggled by collision handler 33. */
  toggle076C: number;
  /** DS:0780 shared/special pickup counter. */
  specialCounter0780: number;
  /** DS:0784 special collision/boss latch. */
  collisionLatch0784: number;
  /** High-level runtime-id equivalent of the DS:079D linked/boss object pointer. */
  linkedTargetRuntimeId079D: number | null;
  /** DS:0813 level-specific hit/progression counter. */
  specialCounter0813: number;
  /** DS:0815 spray-can action meter. */
  sprayMeter0815: number;
  /** DS:0817 packed-BCD-ish progression word touched by handler 35. */
  specialState0817: number;
  /** DS:0781/0782 meters primed by inventory pickups 11/10. */
  level4Meter0781: number;
  level3Meter0782: number;
  /** DS:0823 one-shot activation latch used by handler 42. */
  risingActivation0823: number;
  /** Packed-BCD counters for DS:0772..077F. */
  inventoryCounts: number[];
  /** Current Bart action/inventory state shared with collision handlers. */
  inventory: InventoryRuntime;
  lastDeferredHandler: number | null;
  lastDeferredReason: string | null;
}

export interface GameHudRuntime {
  livesRemaining: number;
  healthCounter: number;
  maxHealthPoints: number;
  score: number;
  levelTimer: number;
  timerDivider: number;
  goalsRemaining: number;
  goalsInitial: number;
  gameOver: boolean;
  lastEvent: string | null;
}

export interface EventMessageRecord {
  segment: number;
  offset: number;
  lines: string[];
  raw_hex?: string;
}

export interface EventMessagesJson {
  level: number;
  messages: EventMessageRecord[];
}

export interface GlobalEventRuntime {
  words: number[];
  segment: number;
  offset: number;
  lines: string[];
  changedAtTick: number;
}

export interface VmInstructionRuntimeState {
  visits: number;
  lastTick: number | null;
  lastOutcome: string | null;
  lastDetail: string | null;
}

export interface VmHistoryEntry {
  tick: number;
  pc: number;
  name: string;
  outcome: string;
  detail: string | null;
}

export interface VmWaitRuntime {
  originPc: number;
  resumePc: number;
  reason: "delay" | "condition" | "runtime-slot";
  startedAtTick: number;
  initialDelay: number | null;
  threshold: number | null;
  detail: string | null;
}

export interface VmBranchRuntime {
  pc: number;
  tick: number;
  kind: string;
  targetPc: number | null;
  detail: string | null;
}

export interface LoadedLevel {
  level: LevelNumber;
  manifest: ManifestJson;
  runtime: RuntimeDataJson;
  scripts: ObjectScriptsJson;
  background: HTMLImageElement;
  playerConfig: BartPlayerConfig;
  descriptorByIndex: Map<number, SpriteDescriptor>;
  imageByDescriptorIndex: Map<number, HTMLImageElement>;
  bartDescriptorByIndex: Map<number, SpriteDescriptor>;
  bartImageByDescriptorIndex: Map<number, HTMLImageElement>;
  flowByType: Map<number, ObjectTypeFlow>;
  collisionByType: Map<number, CollisionProfile>;
  eventMessages?: EventMessagesJson;
  eventMessageByKey?: Map<string, EventMessageRecord>;
}

export type VmState = "ready" | "blocked" | "despawned";

export interface GameObjectRuntime {
  runtimeId: number;
  source: LevelObjectSource;
  flow: ObjectTypeFlow | null;
  collision: CollisionProfile | null;

  active: boolean;
  sourceAttached: boolean;
  flags: number;
  x: number;
  y: number;
  typeOffset: number;
  typeId: number;
  scriptPC: number;
  scriptDelay: number;

  velocityX: number;
  velocityY: number;
  accelerationX: number;
  accelerationY: number;
  fractionX: number;
  fractionY: number;

  animBase: number;
  animFrameCount: number;
  animTimer: number;
  animReload: number;
  animFrame: number;
  renderOffset: number;
  runtimeFlags: number;
  /** Last three bytes supplied to DOS ExternalSpecial3Bytes (5C83h). */
  specialRenderBytes: [number, number, number] | null;
  /** Runtime +2Ch. Several collision handlers inspect/use this field. */
  motionReferenceX: number;

  descriptorBank: "object" | "bart" | null;
  descriptorIndex: number | null;
  descriptor: SpriteDescriptor | null;
  image: HTMLImageElement | null;

  vmState: VmState;
  vmMessage: string | null;
  vmNote: string | null;
  lastInstructionPc: number | null;
  lastInstructionName: string | null;
  instructionsExecuted: number;
  lastSoundId: number | null;
  /** Physical DOS runtime-pool slot 0..27. */
  slotIndex: number;
  /** Parent runtime slot for SpawnChild-created objects, null for source objects. */
  parentRuntimeId: number | null;
  /** Raw GameObject+2Ah word; Level-1 natives also use it as a countdown/link field. */
  linkField2A: number;
  /** Snapshot of SetGlobalEventData when a speech-bubble child was created. */
  eventTextSnapshot: string[] | null;
  vmInstructionStates: Map<number, VmInstructionRuntimeState>;
  vmHistory: VmHistoryEntry[];
  vmWait: VmWaitRuntime | null;
  vmLastBranch: VmBranchRuntime | null;
}

export interface RuntimeStats {
  tick: number;
  collisionEvents: number;
  activeObjects: number;
  visibleSprites: number;
  blockedObjects: number;
  despawnedObjects: number;
}
