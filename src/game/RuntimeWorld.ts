import { BartPlayer } from "./BartPlayer.js";
import {
  CollisionGameplayEffects,
  CollisionSystem,
} from "./CollisionSystem.js";
import { ScriptVm } from "./ScriptVm.js";
import { createInventoryRuntime, InventorySystem } from "./InventorySystem.js";
import { LevelHandlerRegistry } from "./levels/LevelHandlerRegistry.js";
import type {
  LevelBartActionMode,
  LevelHudMeter,
  LevelInteractionOverlay,
  LevelRuntimeServices,
} from "./levels/LevelHandlers.js";
import {
  BartInputState,
  BartRuntime,
  CollisionGlobalRuntime,
  GameHudRuntime,
  InventoryProjectileRuntime,
  GameObjectRuntime,
  GlobalEventRuntime,
  LevelObjectSource,
  LoadedLevel,
  RuntimeStats,
  ScriptInstruction,
} from "./types.js";

// JavaScript numbers do not overflow like DOS registers. These helpers keep
// the low 16/8 bits and, where needed, interpret the sign bit. For example,
// FFFFh is 65535 as an unsigned word but -1 as a signed word.
function u16(value: number): number {
  return value & 0xffff;
}
function s16(value: number): number {
  const v = value & 0xffff;
  return v & 0x8000 ? v - 0x10000 : v;
}
function s8(value: number): number {
  const v = value & 0xff;
  return v & 0x80 ? v - 0x100 : v;
}
// Packed BCD stores one decimal digit per nibble: 24h means 24, not 36.
// DOS inventory/goals use BCD; positions, timers and boss HP do not.
function bcdByteToNumber(value: number): number {
  const b = value & 0xff;
  return ((b >>> 4) & 15) * 10 + (b & 15);
}
function scoreCodeToPoints(code: number): number {
  const v = code & 0xff;
  return v <= 9 ? v : ((v >>> 4) & 15) * 10;
}
function argNumber(i: ScriptInstruction, key: string, fallback = 0): number {
  const v = i.args[key];
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

const POOL_SIZE = 28;

/**
 * One running level, independent of canvas drawing and browser audio.
 *
 * A source record is a persistent placement in the level. A runtime object is
 * a temporary slot that exists while the source is near the camera. Children
 * such as speech bubbles use the same 28 slots, without a persistent source.
 * Keeping these separate is essential: scrolling away must free the slot but
 * preserve changes to the placement (for example, an already collected item).
 *
 * tick() is the main reading entry point. It orders player movement, object
 * scripts/motion, collisions and inventory just as the recovered DOS loop does.
 */
export class RuntimeWorld {
  readonly objects: GameObjectRuntime[] = [];
  readonly bartPlayer: BartPlayer;
  readonly hud: GameHudRuntime;
  readonly collisionState: CollisionGlobalRuntime;
  readonly inventorySystem: InventorySystem;
  tickCount = 0;
  globalEvent: GlobalEventRuntime | null = null;
  /** Collected helper letters (DOS 07AF), not purple goals or 0766 progress. */
  helperTokensCollected = 0;
  streamCameraX = 0;
  levelFinished = false;
  /** Display-driver mailbox +000A. The newest request replaces the old one. */
  private pendingSoundId: number | null = null;
  private randomState = 0x4d35;
  private collisionsEnabled = true;
  private cheatCowabunga = false;
  private cheatEatMyShorts = false;
  private readonly vm: ScriptVm;
  private readonly levelHandlers = new LevelHandlerRegistry();
  private readonly collisions: CollisionSystem;
  private sourceStates: LevelObjectSource[] = [];
  private sourceByOffset = new Map<number, LevelObjectSource>();

  constructor(readonly level: LoadedLevel) {
    const initialGoals = bcdByteToNumber(level.playerConfig.initial_goals_bcd);
    this.hud = {
      livesRemaining: 3,
      healthCounter: 1,
      maxHealthPoints: 2,
      score: 0,
      levelTimer: 999,
      timerDivider: 0x1e,
      goalsRemaining: initialGoals,
      goalsInitial: initialGoals,
      gameOver: false,
      lastEvent: null,
    };
    this.bartPlayer = new BartPlayer(level, (id) => this.queueSound(id));
    this.collisionState = {
      levelProgress0766: 0,
      patternState0768: 0,
      sequenceCounter076A: 0,
      toggle076C: 0,
      specialCounter0780: 0,
      collisionLatch0784: 0,
      bossHitPoints: 0,
      linkedTargetRuntimeId079D: null,
      specialCounter0813: 0,
      sprayMeter0815: 0,
      specialState0817: 0,
      level4Meter0781: 0,
      level3Meter0782: 0,
      risingActivation0823: 0,
      inventoryCounts: new Array<number>(14).fill(0),
      inventory: createInventoryRuntime(),
      lastDeferredHandler: null,
      lastDeferredReason: null,
    };
    const levelServices: LevelRuntimeServices = {
      level: this.level,
      bart: this.bart,
      hud: this.hud,
      collisionState: this.collisionState,
      activateSourceRecord: (offset, flags, mode) =>
        this.activateSourceRecord(offset, flags, mode),
      sourceFlags: (offset) => this.sourceFlags(offset),
      sourceTypeOffset: (offset) => this.sourceTypeOffset(offset),
      teleportBart: (x) => this.teleportBart(x),
      stepBartJumpState: (input) => this.bartPlayer.stepJumpState(input),
      resolveBartStaticTerrain: (previousBart, input) => {
        if (this.collisionsEnabled)
          this.collisions.resolveStaticTerrain(previousBart, input);
      },
      refreshBartSprite: () => this.bartPlayer.refreshSprite(),
      getCameraWorldX: () => this.streamCameraX,
      setCameraWorldX: (value) => {
        this.streamCameraX = this.clampCamera(value);
      },
      allocateTransientGraphic: (x, y, graphicOffset, segment) =>
        this.allocateTransientGraphic(x, y, graphicOffset, segment),
      clearTransientGraphic: (runtimeId) =>
        this.clearTransientGraphic(runtimeId),
      setTransientGraphicOffset: (runtimeId, graphicOffset, segment) =>
        this.setTransientGraphicOffset(runtimeId, graphicOffset, segment),
      nextRandom: () => this.nextRandom(),
      getLevelFinished: () => this.levelFinished,
      setLevelFinished: (value) => {
        this.levelFinished = value;
      },
    };
    this.levelHandlers.load(level, levelServices);
    const gameplayEffects: CollisionGameplayEffects = {
      queueSound: (id) => this.queueSound(id),
      addScoreCode: (code) => this.addScoreCode(code),
      addLives: (count) => this.addLives(count),
      decrementGoals: () => this.decrementGoals(),
      collectHelperToken: () => this.collectHelperToken(),
      externalCountdownSourceFlags: () =>
        this.sourceFlags(this.level.playerConfig.inventory_item6_source_offset),
      setExternalCountdownSourceFlags: (flags) => {
        const offset = this.level.playerConfig.inventory_item6_source_offset;
        if (offset !== undefined)
          this.activateSourceRecord(offset, flags, "set");
      },
    };
    this.collisions = new CollisionSystem(
      level,
      this.bartPlayer,
      this.collisionState,
      gameplayEffects,
    );
    this.inventorySystem = new InventorySystem(
      level,
      this.bartPlayer,
      this.collisionState,
      {
        queueSound: (id) => this.queueSound(id),
        createReservedProjectile: (kind, right, x, y) => this.createReservedProjectile(kind, right, x, y),
        stepReservedProjectile: (projectile) => this.stepReservedProjectile(projectile),
      setHudEvent: (message) => {
          this.hud.lastEvent = message;
        },
        addLives: (c) => this.addLives(c),
        addScoreCode: (c) => this.addScoreCode(c),
        activateSourceRecord: (offset, flags, mode) =>
          this.activateSourceRecord(offset, flags, mode),
        sourceFlags: (offset) => this.sourceFlags(offset),
        teleportBart: (x) => this.teleportBart(x),
        handleLevelInventoryItemUse: (event) =>
          this.levelHandlers.handleInventoryItemUse(event),
      },
    );
    this.vm = new ScriptVm({
      queueSound: (id) => this.queueSound(id),
      decrementObjectiveCounter: () => this.decrementGoals(),
      getBartX: () => this.bart.x,
      detachSource: (o) => this.detachSource(o),
      despawnObject: (o, r) => this.despawnObject(o, r),
      persistObjectY: (o) => this.persistObjectY(o),
      updateSourceTypeFlags: (o, t, f) => this.updateSourceTypeFlags(o, t, f),
      onObjectTypeChanged: (o) => this.onObjectTypeChanged(o),
      setGlobalEventData: (o, w) => this.setGlobalEventData(o, w),
      spawnChild: (p, i, a) => this.spawnChild(p, i, a),
      callNative: (o, i, e, n) =>
        this.levelHandlers.handleNativeCall(o, i, e, n),
      setLevelCameraState: (_o, mode, target) =>
        this.setLevelCameraState(mode, target),
      setObjectSpecialRenderBytes: (o, bytes) => {
        o.specialRenderBytes = [...bytes] as [number, number, number];
      },
    });
    this.reset();
  }

  get bart(): BartRuntime {
    return this.bartPlayer.state;
  }
  get healthPoints(): number {
    return Math.max(
      0,
      Math.min(this.hud.maxHealthPoints, this.hud.healthCounter + 1),
    );
  }
  areCollisionsEnabled(): boolean {
    return this.collisionsEnabled;
  }
  setCollisionsEnabled(enabled: boolean): void {
    this.collisionsEnabled = enabled;
  }
  setDebugInvulnerable(enabled: boolean): void {
    this.bartPlayer.setDebugInvulnerable(enabled);
  }
  isDebugInvulnerable(): boolean {
    return this.bartPlayer.isDebugInvulnerable();
  }
  activateCowabungaCheat(): void {
    this.cheatCowabunga = true;
    this.hud.lastEvent = "COWABUNGA â€” unlimited lives";
  }
  activateEatMyShortsCheat(): void {
    this.cheatEatMyShorts = true;
    this.hud.lastEvent = "-EATMYSHORTS â€” unlimited lives + F level complete";
  }
  getCheatState(): { cowabunga: boolean; eatMyShorts: boolean } {
    return {
      cowabunga: this.cheatCowabunga,
      eatMyShorts: this.cheatEatMyShorts,
    };
  }
  triggerEatMyShortsLevelSkip(): boolean {
    if (!this.cheatEatMyShorts) return false;
    this.levelFinished = true;
    this.hud.lastEvent = "-EATMYSHORTS: F set level-finished flag";
    return true;
  }

  /** Keep sound events usable in tests and viewers without a browser audio API. */
  queueSound(id: number): void {
    if (Number.isInteger(id) && ((id >= 0 && id <= 0x12) || id === 0xff)) {
      this.pendingSoundId = id;
    }
  }

  consumeSoundCommand(): number | null {
    const id = this.pendingSoundId;
    this.pendingSoundId = null;
    return id;
  }

  reset(): void {
    this.pendingSoundId = null;
    this.tickCount = 0;
    this.globalEvent = null;
    this.helperTokensCollected = 0;
    this.levelFinished = false;
    this.randomState = 0x4d35;
    this.collisionState.linkedTargetRuntimeId079D = null;
    this.levelHandlers.reset();
    this.bartPlayer.reset();
    this.collisions.reset();
    this.inventorySystem.reset();
    // Ten HP is the recovered Level-1 fallback for older local exports.
    this.collisionState.bossHitPoints =
      this.level.playerConfig.boss_hit_points ??
      (this.level.level === 1 ? 10 : 0);
    this.collisionState.inventoryCounts.fill(0);
    this.collisionState.inventoryCounts[13] = 0x01;
    this.collisionState.inventoryCounts[2] = 0x10;
    this.hud.livesRemaining = 3;
    this.hud.healthCounter = 1;
    this.hud.maxHealthPoints = 2;
    this.hud.score = 0;
    this.hud.levelTimer = 999;
    this.hud.timerDivider = 0x1e;
    this.hud.goalsInitial = bcdByteToNumber(
      this.level.playerConfig.initial_goals_bcd,
    );
    this.hud.goalsRemaining = this.hud.goalsInitial;
    this.hud.gameOver = false;
    this.hud.lastEvent = "Level runtime initialized";
    this.sourceStates = this.level.runtime.object_sources.map((s) => ({
      ...s,
      flags: u16(s.flags),
      type_offset: u16(s.type_offset),
    }));
    this.sourceByOffset = new Map(this.sourceStates.map((s) => [s.offset, s]));
    this.objects.length = 0;
    for (let slot = 0; slot < POOL_SIZE; slot++)
      this.objects.push(this.blankSlot(slot));
    this.streamCameraX = this.clampCamera(this.bart.x - 0x88);
    this.streamSourceWindow();
  }

  /**
   * Advance one logical gameplay tick. The viewer decides how often to call
   * this; no wall-clock time or rendering is used to calculate movement.
   * DOS object delays run the VM when the signed counter becomes negative,
   * so a script's Wait 0 still yields until the next object update.
   */
  tick(
    input: BartInputState = {
      left: false,
      right: false,
      jump: false,
      down: false,
      action: false,
      inventory: false,
    },
  ): void {
    this.tickCount++;
    if (this.hud.gameOver) return;
    if (this.bart.hitDeathTimer > 0) {
      this.stepHitDeathSequence();
      return;
    }
    this.stepLevelTimer();
    this.bartPlayer.beginTick();

    // DOS UpdateBart runs before UpdateBartActionAndWeaponState. The Bart
    // animation therefore observes the previous action state, and Q+FIRE can
    // optionally consume FIRE on the Q+FIRE fast-jump path before the later weapon pass.
    const previousActionActive = this.collisionState.inventory.actionActive;
    const previousBart = { x: this.bart.x, y: this.bart.y };
    const levelPlayerStep = this.levelHandlers.beforePlayerStep({
      input,
      tick: this.tickCount,
      previousBart,
    });
    if (levelPlayerStep.continueGenericBartUpdate) {
      this.bartPlayer.stepMotion(input);
      if (this.collisionsEnabled)
        this.collisions.resolveStaticTerrain(previousBart, input);
      this.bartPlayer.finishTick(input, previousActionActive);
    }

    const actionConsumed = this.bartPlayer.consumeActionRequested();
    const actionInput: BartInputState = actionConsumed
      ? { ...input, action: false }
      : input;
    const actionMode: LevelBartActionMode =
      levelPlayerStep.bartActionMode ?? "normal";
    this.inventorySystem.beginTick(actionInput, actionMode);

    // DOS streams before updating active runtime slots.
    this.streamSourceWindow();
    const previousObjects = new Map<number, { x: number; y: number }>();
    for (const object of this.objects) {
      if (!object.active) continue;
      previousObjects.set(object.runtimeId, { x: object.x, y: object.y });
      if (object.vmState === "ready") {
        object.scriptDelay = u16(object.scriptDelay - 1);
        if (s16(object.scriptDelay) < 0) {
          const result = this.vm.runUntilYield(object, this.tickCount);
          if (result.despawned || !object.active) continue;
        }
      }
      this.stepMotion(object);
      this.stepAnimation(object);
      object.runtimeFlags = u16(object.runtimeFlags | 1);
      this.resolveCurrentDescriptor(object);
    }
    this.bartPlayer.stepRenderBlink();
    if (this.collisionsEnabled) {
      const hitBefore = this.bart.hitDeathTimer;
      this.collisions.resolveObjectCollisions(
        previousBart,
        previousObjects,
        this.objects,
      );
      if (hitBefore === 0 && this.bart.hitDeathTimer > 0)
        this.hud.lastEvent = this.bart.lastCollision ?? "Bart hit";
    }
    this.inventorySystem.endTick(
      actionInput,
      levelPlayerStep.suppressInventorySelection ?? false,
    );
    this.updateCamera();
  }

  consumePauseRequest(): boolean {
    return this.inventorySystem.consumePauseRequest();
  }
  getLevelHudMeter(): LevelHudMeter | null {
    return this.levelHandlers.getHudMeter();
  }
  getLevelInteractionOverlay(): LevelInteractionOverlay | null {
    return this.levelHandlers.getInteractionOverlay();
  }
  get activeLevelHandler(): number | null {
    return this.levelHandlers.activeLevel;
  }
  dispose(): void {
    this.pendingSoundId = null;
    this.levelHandlers.unload();
  }
  getSourceStateByOffset(offset: number | undefined): LevelObjectSource | null {
    return offset ? (this.sourceByOffset.get(offset) ?? null) : null;
  }
  getObjectBySourceIndex(sourceIndex: number): GameObjectRuntime | null {
    return (
      this.objects.find((o) => o.active && o.source.index === sourceIndex) ??
      null
    );
  }
  getObjectBySlot(slot: number): GameObjectRuntime | null {
    return this.objects[slot] ?? null;
  }

  /** Test/inspector helper: moves the source window so a persistent source can be observed. */
  debugEnsureSourceLoaded(sourceIndex: number): GameObjectRuntime | null {
    const source = this.sourceStates.find((s) => s.index === sourceIndex);
    if (!source) return null;
    this.streamCameraX = this.clampCamera(source.stream_x - 0x80);
    this.streamSourceWindow();
    return this.getObjectBySourceIndex(sourceIndex);
  }

  getStats(): RuntimeStats {
    let activeObjects = 0,
      visibleSprites = 0,
      blockedObjects = 0;
    for (const o of this.objects) {
      if (o.active) activeObjects++;
      if (o.active && o.image) visibleSprites++;
      if (o.active && o.vmState === "blocked") blockedObjects++;
    }
    return {
      tick: this.tickCount,
      collisionEvents: this.bart.collisionCount,
      activeObjects,
      visibleSprites,
      blockedObjects,
      despawnedObjects: POOL_SIZE - activeObjects,
    };
  }

  private blankSlot(slotIndex: number): GameObjectRuntime {
    const source: LevelObjectSource = {
      index: -1 - slotIndex,
      offset: 0,
      stream_x: 0,
      x: 0,
      y: 0,
      type_offset: 0xffff,
      flags: 0,
      type_id: 0x7fff,
    };
    return {
      runtimeId: slotIndex,
      slotIndex,
      source,
      flow: null,
      collision: null,
      active: false,
      sourceAttached: false,
      flags: 0,
      x: 0,
      y: 0,
      typeOffset: 0xffff,
      typeId: 0x7fff,
      scriptPC: 0,
      scriptDelay: 0,
      velocityX: 0,
      velocityY: 0,
      accelerationX: 0,
      accelerationY: 0,
      fractionX: 0,
      fractionY: 0,
      animBase: 0,
      animFrameCount: 0,
      animTimer: 0,
      animReload: 0,
      animFrame: 0,
      renderOffset: 0,
      runtimeFlags: 0,
      motionReferenceX: 0,
      descriptorBank: null,
      descriptorIndex: null,
      descriptor: null,
      image: null,
      specialRenderBytes: null,
      vmState: "despawned",
      vmMessage: "Free DOS runtime slot",
      vmNote: null,
      lastInstructionPc: null,
      lastInstructionName: null,
      instructionsExecuted: 0,
      lastSoundId: null,
      parentRuntimeId: null,
      linkField2A: 0,
      eventTextSnapshot: null,
      vmInstructionStates: new Map(),
      vmHistory: [],
      vmWait: null,
      vmLastBranch: null,
    };
  }

  private initializeSlot(
    slot: GameObjectRuntime,
    source: LevelObjectSource,
    transient = false,
    parent: GameObjectRuntime | null = null,
    runtimeFlags = 0,
  ): void {
    const typeId = source.type_offset >>> 1;
    const flow = this.level.flowByType.get(typeId) ?? null;
    slot.source = source;
    slot.flow = flow;
    slot.collision = this.level.collisionByType.get(typeId) ?? null;
    slot.active = true;
    slot.sourceAttached = !transient;
    slot.flags = transient ? 0x8000 : u16(source.flags);
    slot.x = source.x;
    slot.y = source.y;
    slot.typeOffset = u16(source.type_offset);
    slot.typeId = typeId;
    slot.scriptPC = flow?.entry_offset ?? 0;
    slot.scriptDelay = 0;
    slot.velocityX =
      slot.velocityY =
      slot.accelerationX =
      slot.accelerationY =
        0;
    slot.fractionX = slot.fractionY = 0;
    slot.animBase =
      slot.animFrameCount =
      slot.animTimer =
      slot.animReload =
      slot.animFrame =
      slot.renderOffset =
        0;
    slot.runtimeFlags = u16(runtimeFlags);
    slot.motionReferenceX = 0;
    slot.descriptorBank = null;
    slot.descriptorIndex = null;
    slot.descriptor = null;
    slot.image = null;
    slot.specialRenderBytes = null;
    slot.vmState = flow ? "ready" : "blocked";
    slot.vmMessage = flow
      ? null
      : "No decoded script flow exists for this type.";
    slot.vmNote = null;
    slot.lastInstructionPc = null;
    slot.lastInstructionName = null;
    slot.instructionsExecuted = 0;
    slot.lastSoundId = null;
    slot.parentRuntimeId = parent?.runtimeId ?? null;
    slot.linkField2A = 0;
    slot.eventTextSnapshot = null;
    slot.vmInstructionStates = new Map();
    slot.vmHistory = [];
    slot.vmWait = null;
    slot.vmLastBranch = null;
  }

  /**
   * Load eligible placements into free slots around the camera. 8000h means
   * enabled; 4000h means already resident. Loading the same source twice would
   * duplicate pickups and scripted events, so both flags are checked first.
   */
  private streamSourceWindow(): void {
    this.unloadOutsideWindow();
    const lower = this.streamCameraX - 0x30,
      upper = this.streamCameraX + 0x170;
    for (const source of this.sourceStates) {
      if (
        source.type_offset === 0xffff ||
        (source.flags & 0x8000) === 0 ||
        (source.flags & 0x4000) !== 0
      )
        continue;
      if (!(source.stream_x > lower && source.stream_x <= upper)) continue;
      const slot = this.objects.find((o) => !o.active);
      if (!slot) break;
      source.flags = u16(source.flags | 0x4000);
      this.initializeSlot(slot, source, false, null, 0);
    }
  }

  private unloadOutsideWindow(): void {
    const lower = this.streamCameraX - 0x30,
      upper = this.streamCameraX + 0x170;
    for (const o of this.objects) {
      if (!o.active) continue;
      if ((o.flags & 0x0800) !== 0) {
        if (o.x < this.streamCameraX - 32 || o.x > this.streamCameraX + 360)
          this.releaseSlot(o, true);
        continue;
      }
      if (!o.sourceAttached) continue;
      if (!(o.source.stream_x > lower && o.source.stream_x <= upper))
        this.releaseSlot(o, true);
    }
  }

  private releaseSlot(o: GameObjectRuntime, persistType: boolean): void {
    if (o.sourceAttached) {
      if (persistType && o.typeOffset !== 0x32) {
        o.source.type_offset = u16(o.typeOffset);
        o.source.type_id = o.typeId;
      }
      o.source.flags = u16(o.source.flags & ~0x4000);
    }
    const slot = o.slotIndex;
    Object.assign(o, this.blankSlot(slot));
  }

  private sourceFlags(offset: number | undefined): number | null {
    return this.getSourceStateByOffset(offset)?.flags ?? null;
  }
  private sourceTypeOffset(offset: number | undefined): number | null {
    const s = this.getSourceStateByOffset(offset);
    return s ? u16(s.type_offset) : null;
  }
  private activateSourceRecord(
    offset: number | undefined,
    flags: number,
    mode: "or" | "set" = "set",
  ): boolean {
    const source = this.getSourceStateByOffset(offset);
    if (!source) return false;
    source.flags = mode === "or" ? u16(source.flags | flags) : u16(flags);
    const active = this.objects.find((o) => o.active && o.source === source);
    // Persistent source bit 8000h is the DOS load/active gate. Clearing it
    // while the source is resident also frees that 30h runtime slot; merely
    // copying flags=0 into our separate `active` boolean model would leave a
    // ghost collider/script alive.
    if (active && (source.flags & 0x8000) === 0)
      this.releaseSlot(active, false);
    else if (active) active.flags = source.flags;
    this.streamSourceWindow();
    return true;
  }
  private detachSource(o: GameObjectRuntime): void {
    if (o.sourceAttached) {
      o.source.flags = 0;
      o.sourceAttached = false;
    }
  }
  private despawnObject(o: GameObjectRuntime, reason: string): void {
    if (o.sourceAttached) o.source.flags = u16(o.source.flags & ~0x4000);
    o.active = false;
    o.flags = 0;
    o.vmState = "despawned";
    o.vmMessage = reason;
  }
  private persistObjectY(o: GameObjectRuntime): void {
    if (o.sourceAttached) o.source.y = o.y;
  }
  private updateSourceTypeFlags(
    o: GameObjectRuntime,
    typeOffset: number,
    flags: number,
  ): void {
    if (!o.sourceAttached) return;
    o.source.type_offset = u16(typeOffset);
    o.source.type_id = o.source.type_offset >>> 1;
    o.source.flags = u16(flags);
  }
  private onObjectTypeChanged(o: GameObjectRuntime): void {
    o.collision = this.level.collisionByType.get(o.typeId) ?? null;
  }

  private setGlobalEventData(_o: GameObjectRuntime, words: number[]): void {
    const offset = u16(words[1] ?? 0),
      segment = u16(words[2] ?? 0);
    const key = `${segment}:${offset}`;
    const rec = this.level.eventMessageByKey?.get(key);
    const lines = rec?.lines?.slice() ?? [];
    this.globalEvent = {
      words: words.slice(),
      segment,
      offset,
      lines,
      changedAtTick: this.tickCount,
    };
    if (lines.length) this.hud.lastEvent = lines.join(" / ");
  }

  private allocateTransientGraphic(
    x: number,
    y: number,
    graphicOffset: number,
    segment = 0x096d,
  ): number | null {
    const slot = this.objects.find((o) => !o.active);
    if (!slot) return null;
    const source: LevelObjectSource = {
      index: -2000 - (this.tickCount * 32 + slot.slotIndex),
      offset: 0,
      stream_x: x,
      x,
      y,
      type_offset: 0xffff,
      flags: 0,
      type_id: 0x7fff,
    };
    Object.assign(slot, this.blankSlot(slot.slotIndex));
    slot.source = source;
    slot.active = true;
    slot.sourceAttached = false;
    slot.flags = 0x8000;
    slot.x = Math.trunc(x);
    slot.y = Math.trunc(y);
    slot.animBase = u16(graphicOffset);
    slot.renderOffset = u16(graphicOffset);
    slot.vmState = "blocked";
    slot.vmMessage = `Transient graphic ${this.hex(segment)}:${this.hex(graphicOffset)} (common overlay raster not decoded)`;
    slot.vmNote =
      "Allocated by generic DOS AllocateTransientGraphicObject equivalent";
    return slot.runtimeId;
  }
  private clearTransientGraphic(runtimeId: number | null): void {
    if (runtimeId === null) return;
    const object = this.objects[runtimeId];
    if (
      !object?.active ||
      object.sourceAttached ||
      object.typeOffset !== 0xffff
    )
      return;
    this.releaseSlot(object, false);
  }
  private setTransientGraphicOffset(
    runtimeId: number | null,
    graphicOffset: number,
    segment = 0x096d,
  ): void {
    if (runtimeId === null) return;
    const object = this.objects[runtimeId];
    if (
      !object?.active ||
      object.sourceAttached ||
      object.typeOffset !== 0xffff
    )
      return;
    object.animBase = u16(graphicOffset);
    object.renderOffset = u16(graphicOffset);
    object.vmMessage = `Transient graphic ${this.hex(segment)}:${this.hex(graphicOffset)} (common overlay raster not decoded)`;
  }

  private spawnChild(
    parent: GameObjectRuntime,
    i: ScriptInstruction,
    afterCurrent: boolean,
  ): boolean {
    const start = afterCurrent ? parent.slotIndex + 1 : 0;
    let slot: GameObjectRuntime | undefined;
    for (let n = start; n < POOL_SIZE; n++) {
      if (!this.objects[n]!.active) {
        slot = this.objects[n];
        break;
      }
    }
    if (!slot) return false;
    const typeOffset = u16(argNumber(i, "type_offset"));
    const source: LevelObjectSource = {
      index: -1000 - (this.tickCount * 32 + slot.slotIndex),
      offset: 0,
      stream_x: parent.x,
      x: parent.x + s16(argNumber(i, "x_offset")),
      y: parent.y + s16(argNumber(i, "y_offset")),
      type_offset: typeOffset,
      flags: 0x8000,
      type_id: typeOffset >>> 1,
    };
    this.initializeSlot(
      slot,
      source,
      true,
      parent,
      argNumber(i, "runtime_flags"),
    );
    this.levelHandlers.onChildSpawned({
      parent,
      child: slot,
      globalEvent: this.globalEvent,
    });
    return true;
  }

  private nextRandom(): number {
    let x = this.randomState & 0xffff;
    x ^= (x << 7) & 0xffff;
    x ^= x >>> 9;
    x ^= (x << 8) & 0xffff;
    this.randomState = x & 0xffff;
    return this.randomState;
  }

  private setLevelCameraState(mode: number, target: number): void {
    // Script_SetLevelCameraState @ 5E1Bh stores the mode byte, target and
    // raises the left world bound to target. Positive mode sets the temporary
    // Bart max bound to target+012Ch; negative mode uses 5000h.
    const signedMode = s8(mode);
    this.bart.minX = u16(target);
    const scriptedMax = signedMode < 0 ? 0x5000 : u16(target + 0x012c);
    this.bart.maxX = scriptedMax;
    this.hud.lastEvent = `Camera state ${signedMode} @ ${this.hex(target)}`;
  }

  private teleportBart(x: number): void {
    const b = this.bart;
    b.x = Math.max(b.minX, Math.min(b.maxX, Math.trunc(x)));
    b.velocityX = b.velocityY = 0;
    b.airborne = false;
    b.supportKind = "ground";
    b.supportSourceIndex = null;
    b.y = b.groundY;
    b.supportY = b.groundY;
    this.updateCamera(true);
  }
  private updateCamera(force = false): void {
    let c = this.streamCameraX;
    const rel = this.bart.x - c;
    if (force) c = this.bart.x - 0x88;
    else if (rel < 0x34) c = this.bart.x - 0x34;
    else if (rel > 0xfc) c = this.bart.x - 0xfc;
    this.streamCameraX = this.clampCamera(c);
  }
  private clampCamera(v: number): number {
    return Math.max(
      0,
      Math.min(this.level.playerConfig.camera_max_x, Math.trunc(v)),
    );
  }

  private stepHitDeathSequence(): void {
    const b = this.bart;
    b.hitDeathTimer = Math.max(0, b.hitDeathTimer - 1);
    if (b.hitDeathTimer !== 0) return;
    this.hud.healthCounter--;
    if (this.hud.healthCounter >= 0) {
      this.hud.lastEvent = `Bart hit â€” health ${this.healthPoints}/${this.hud.maxHealthPoints}`;
      return;
    }
    const unlimitedLives = this.cheatCowabunga || this.cheatEatMyShorts;
    if (!unlimitedLives)
      this.hud.livesRemaining = Math.max(0, this.hud.livesRemaining - 1);
    if (!unlimitedLives && this.hud.livesRemaining === 0) {
      this.hud.healthCounter = 0;
      this.hud.gameOver = true;
      b.blinkPhase = 0xff;
      b.renderVisible = false;
      this.hud.lastEvent = "GAME OVER";
      return;
    }
    this.collisionState.bossHitPoints =
      this.level.playerConfig.boss_respawn_hit_points ??
      (this.level.level === 1 ? 10 : 0);
    this.collisionState.collisionLatch0784 = 0;
    this.hud.healthCounter = 1;
    this.bartPlayer.respawnAtLevelStart();
    this.updateCamera(true);
    this.hud.lastEvent = unlimitedLives
      ? `Cheat respawn â€” lives stay ${this.hud.livesRemaining}`
      : `Life lost â€” ${this.hud.livesRemaining} remaining (respawn at level start)`;
  }
  private stepLevelTimer(): void {
    if (this.hud.levelTimer <= 0) return;
    if (--this.hud.timerDivider > 0) return;
    this.hud.timerDivider = 0x23;
    this.hud.levelTimer = Math.max(0, this.hud.levelTimer - 1);
  }
  private addScoreCode(code: number): void {
    const p = scoreCodeToPoints(code);
    if (p <= 0) return;
    this.hud.score = Math.min(999999, this.hud.score + p);
    this.hud.lastEvent = `Score +${p}`;
  }
  private addLives(c: number): void {
    if (c <= 0) return;
    this.hud.livesRemaining = Math.min(
      99,
      this.hud.livesRemaining + Math.trunc(c),
    );
    this.hud.lastEvent = `Extra life â€” ${this.hud.livesRemaining} lives`;
  }
  private collectHelperToken(): void {
    const required = this.level.playerConfig.helper_token_count;
    if (required === undefined || this.helperTokensCollected >= required) return;
    this.helperTokensCollected++;
    // 6853h..6864h enables the helper source on the last letter only.
    if (this.helperTokensCollected === required) {
      this.activateSourceRecord(this.level.playerConfig.helper_source_offset, 0x8000, "set");
    }
    this.hud.lastEvent = `Helper letters ${this.helperTokensCollected}/${required}`;
  }

  private decrementGoals(): void {
    if (this.hud.goalsRemaining <= 0) return;
    this.hud.goalsRemaining--;
    this.hud.lastEvent = `Goal counter ${this.hud.goalsRemaining}/${this.hud.goalsInitial}`;
    // DOS UpdateGoalAndGateState clears the LevelRuntimeConfig goal-gate
    // source record as soon as the packed-BCD objective counter reaches 0.
    if (this.hud.goalsRemaining === 0) {
      const gate = this.level.playerConfig.goal_gate_source_offset;
      if (gate !== undefined) this.activateSourceRecord(gate, 0, "set");
    }
  }
  /** DS:0E87 is a reserved slot outside the normal 28 streamed objects. */
  private createReservedProjectile(kind: "rocket" | "cherry-bomb", right: boolean, x: number, y: number): InventoryProjectileRuntime | null {
    const key = `${kind === "rocket" ? "rocket" : "bomb"}_${right ? "right" : "left"}`;
    const flow = this.level.playerConfig.reserved_action_scripts?.[key];
    const typeOffset = kind === "rocket" ? 4 : 2;
    if (!flow) return null;
    const object = this.blankSlot(-1);
    Object.assign(object, { active: true, sourceAttached: false, flags: 0x8080,
      x, y, typeOffset, flow, scriptPC: flow.entry_offset, vmState: "ready" });
    return { active: true, kind, typeOffset, x, y,
      velocityX: 0, velocityY: 0, accelerationY: 0, lifetime: 0,
      scriptRuntime: object };
  }

  private stepReservedProjectile(projectile: InventoryProjectileRuntime): void {
    const object = projectile.scriptRuntime!;
    object.scriptDelay = u16(object.scriptDelay - 1);
    if (s16(object.scriptDelay) < 0) this.vm.runUntilYield(object, this.tickCount);
    if (object.vmState === "blocked") {
      this.hud.lastEvent = `${projectile.kind} blocked: ${object.vmMessage}`;
      object.active = false;
    }
    if (object.active) {
      this.stepMotion(object);
      this.stepAnimation(object);
      this.resolveCurrentDescriptor(object);
    }
    Object.assign(projectile, { active: object.active, x: object.x, y: object.y,
      velocityX: object.velocityX, velocityY: object.velocityY, accelerationY: object.accelerationY });
    if (object.descriptorIndex !== null) projectile.descriptorIndex = object.descriptorIndex;
  }

  private stepMotion(o: GameObjectRuntime): void {
    o.velocityX = s16(o.velocityX + o.accelerationX);
    const sx = u16(o.velocityX) + (o.fractionX & 255);
    o.fractionX = sx & 255;
    o.x += s8((sx >>> 8) & 255);
    o.velocityY = s16(o.velocityY + o.accelerationY);
    const sy = u16(o.velocityY) + (o.fractionY & 255);
    o.fractionY = sy & 255;
    o.y += s8((sy >>> 8) & 255);
  }
  private stepAnimation(o: GameObjectRuntime): void {
    let f = u16(o.animFrame);
    o.animTimer = u16(o.animTimer - 1);
    if (o.animTimer === 0) {
      o.animTimer = u16(o.animReload);
      f = u16(f + 1);
      if (s16(f) >= s16(o.animFrameCount)) f = 0;
    }
    o.animFrame = f;
    o.renderOffset = u16(o.animBase + f * 12);
  }
  private resolveCurrentDescriptor(o: GameObjectRuntime): void {
    if (o.animFrameCount === 0) {
      if (!o.sourceAttached && o.typeOffset === 0xffff) {
        const d = this.levelHandlers.resolveTransientGraphicDescriptor(
          o.renderOffset,
        );
        if (d !== null) {
          o.descriptorBank = "object";
          o.descriptorIndex = d;
          o.descriptor = this.level.descriptorByIndex.get(d) ?? null;
          o.image = this.level.imageByDescriptorIndex.get(d) ?? null;
          return;
        }
      }
      o.descriptorIndex = null;
      o.descriptor = null;
      o.image = null;
      return;
    }
    if (o.descriptorBank === "bart") {
      const d = u16(o.renderOffset);
      o.descriptorIndex = d;
      o.descriptor = this.level.bartDescriptorByIndex.get(d) ?? null;
      o.image = this.level.bartImageByDescriptorIndex.get(d) ?? null;
      return;
    }
    // DOS RunObjectScriptVM adds 48h (six 0Ch descriptors) for objects with
    // flag 0400h while DS:07DE X-Ray/alternate graphics is enabled.
    const alternate =
      this.collisionState.inventory.alternateGraphicsTimer !== 0 &&
      (o.flags & 0x0400) !== 0
        ? 6
        : 0;
    const d = Math.trunc(o.renderOffset / 12) + alternate;
    o.descriptorBank = "object";
    o.descriptorIndex = d;
    o.descriptor = this.level.descriptorByIndex.get(d) ?? null;
    o.image = this.level.imageByDescriptorIndex.get(d) ?? null;
  }
  private hex(v: number): string {
    return `0x${u16(v).toString(16).toUpperCase().padStart(4, "0")}`;
  }
}
