import { BartPlayer } from "./BartPlayer.js";
import {
  BartInputState,
  CollisionGlobalRuntime,
  CollisionProfile,
  GameObjectRuntime,
  LoadedLevel,
  StaticTerrain,
} from "./types.js";

interface Position {
  x: number;
  y: number;
}

interface Rect {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

interface CollisionContext {
  object: GameObjectRuntime;
  profile: CollisionProfile;
  previousBart: Position;
  previousObject: Position | undefined;
  objects: GameObjectRuntime[];
}

type CollisionHandler = (ctx: CollisionContext) => boolean;
export type CollisionFidelity = "implemented" | "partial" | "deferred";

export interface CollisionHandlerInfo {
  name: string;
  dosOffset: number;
  fidelity: CollisionFidelity;
  note: string;
}

export interface CollisionGameplayEffects {
  addScoreCode(code: number): void;
  addLives(count: number): void;
  decrementGoals(): void;
  /** DS:08D6/08D8 configured external countdown source used by handler 20. */
  externalCountdownSourceFlags(): number | null;
  setExternalCountdownSourceFlags(flags: number): void;
}

const NOOP_GAMEPLAY_EFFECTS: CollisionGameplayEffects = {
  addScoreCode: () => undefined,
  addLives: () => undefined,
  decrementGoals: () => undefined,
  externalCountdownSourceFlags: () => null,
  setExternalCountdownSourceFlags: () => undefined,
};

const PLATFORM_HANDLERS = new Set([11, 12, 33, 36]);
const AIRBORNE_PATTERN = [2, 0, 1, 0, 1, 2, 0, 2, 1] as const;

export const COLLISION_HANDLER_INFO: Readonly<Record<number, CollisionHandlerInfo>> = {
  0: { name: "None", dosOffset: 0x0000, fidelity: "implemented", note: "No collision handler." },
  1: { name: "DamageBartOrTransitionObject", dosOffset: 0x6650, fidelity: "implemented", note: "Parameter odd/zero/even split and invulnerability gate." },
  2: { name: "CollectAndIncrementCounter76F", dosOffset: 0x6618, fidelity: "implemented", note: "Score 60, sound 0Dh, life/counter increment and consume." },
  3: { name: "TopContactBounceBreakOrDamage", dosOffset: 0x66f1, fidelity: "implemented", note: "Feet/top test, break counters, velocity reflection, score and damage path." },
  4: { name: "CollectInventoryResource", dosOffset: 0x6bfd, fidelity: "partial", note: "Inventory BCD counters and known pickup effects implemented; presentation popup is not." },
  5: { name: "ConsumeObjectAndTriggerEvent7", dosOffset: 0x6cec, fidelity: "implemented", note: "Score 100, goal decrement, sound 7 and consume." },
  6: { name: "CollectObjectiveAndAdvanceSequence", dosOffset: 0x6817, fidelity: "partial", note: "Consume/score/sound implemented; external progression table update is deferred." },
  7: { name: "TransitionObjectAndLaunch", dosOffset: 0x65dc, fidelity: "implemented", note: "Transition then low-nibble launch velocity table." },
  8: { name: "AirborneOnlyTransition", dosOffset: 0x65b5, fidelity: "implemented", note: "Airborne gate, body AABB, transition." },
  9: { name: "GroundedOnlyTransition", dosOffset: 0x66ce, fidelity: "implemented", note: "Grounded gate, body AABB, transition." },
  10: { name: "ResolveHorizontalSolidCollision", dosOffset: 0x6895, fidelity: "partial", note: "Physical side resolution is implemented; a small DOS global/facing gate is approximated." },
  11: { name: "OneWayLandingAndOptionalTransition", dosOffset: 0x6d38, fidelity: "implemented", note: "Center-X landing, 2px tolerance and low-byte landing counter." },
  12: { name: "LandOnMovingPlatform", dosOffset: 0x6dc6, fidelity: "implemented", note: "1px landing tolerance and horizontal platform carry." },
  13: { name: "DescendingAirborneTransition", dosOffset: 0x66dc, fidelity: "implemented", note: "Airborne + non-negative vertical velocity + AABB." },
  14: { name: "SecondaryHitboxBossDamage3", dosOffset: 0x667a, fidelity: "deferred", note: "Needs reserved secondary boss hitbox and boss HP state." },
  15: { name: "BartActionHitObject", dosOffset: 0x68de, fidelity: "implemented", note: "Uses the reconstructed facing-dependent Bart action line-hitbox (083Ah/0EB7h), low-5-bit hit counter and transition/consume path." },
  16: { name: "SpecialObjectType2RegionTransition", dosOffset: 0x697d, fidelity: "implemented", note: "Reserved type-2 (cherry-bomb) object region gate Y>=8Eh, X=B28h..B60h and transition." },
  17: { name: "SpecialObjectType4HitTransition", dosOffset: 0x6a07, fidelity: "implemented", note: "Reserved type-4 rocket point-hit geometry and original stationary velocityX==0 gate." },
  18: { name: "BartProjectileHitsBoss", dosOffset: 0x69ad, fidelity: "deferred", note: "Needs projectile/action object and boss HP state." },
  19: { name: "CollectInvulnerabilityPickup", dosOffset: 0x65c4, fidelity: "implemented", note: "Score 50, invulnerability FAh and detach/despawn." },
  20: { name: "ExternalCountdownTransition", dosOffset: 0x6e50, fidelity: "implemented", note: "Uses the configured external source record: decrement low flags byte while 8000h is set, then transition when it reaches zero." },
  21: { name: "LinkedObjectSpecialTransition", dosOffset: 0x6b87, fidelity: "deferred", note: "Depends on linked source pointer and a hard-coded level sequence." },
  22: { name: "FeetOnlyDamageOrTransition", dosOffset: 0x6e70, fidelity: "implemented", note: "Handler-1 semantics with Bart top shifted down 20px." },
  23: { name: "LinkedObjectProximityTransition", dosOffset: 0x6b47, fidelity: "partial", note: "Runtime type lookup/proximity is implemented; source-link semantics remain approximate." },
  24: { name: "SpecialObjectType8HitElseHazard", dosOffset: 0x6480, fidelity: "implemented", note: "Type-8 dart point-hit interception clears projectile and transitions; miss follows event-7 consume path." },
  25: { name: "SpecialObjectType10ClearIndexedFlag", dosOffset: 0x6a6d, fidelity: "deferred", note: "Needs reserved type-10 action object and indexed level-flag table." },
  26: { name: "SpecialObjectType12ClearFlagAndCount", dosOffset: 0x6ac7, fidelity: "deferred", note: "Needs reserved type-12 action object and level counters." },
  27: { name: "SpecialObjectType14HitElseEvent", dosOffset: 0x5fbd, fidelity: "implemented", note: "Type-14 slingshot point-hit interception plus original flags-bit0 event fallback." },
  28: { name: "FallingLargeObjectHazardOrTopContact", dosOffset: 0x6054, fidelity: "implemented", note: "Falling 48x50 hazard region then handler-3 fallback." },
  29: { name: "DamageBartIfObjectField2CZero", dosOffset: 0x6086, fidelity: "implemented", note: "Low byte of object +2Ch gates handler 1." },
  30: { name: "AABBIncrementCounter780IfReady", dosOffset: 0x617b, fidelity: "implemented", note: "0784/0766/0780 gates and latch update." },
  31: { name: "AirbornePatternMatchTransition", dosOffset: 0x60d6, fidelity: "implemented", note: "Airborne AABB, low-nibble pattern table, +2/wrap state and transition." },
  32: { name: "CollectAndAdvanceCounter76A", dosOffset: 0x60ab, fidelity: "implemented", note: "1Ch gate, score 50, +4 counter, consume." },
  33: { name: "PlatformLandingAndToggle76C", dosOffset: 0x6090, fidelity: "implemented", note: "Moving-platform landing plus 076C toggle at 076A==1Ch." },
  34: { name: "BounceBartUpward", dosOffset: 0x61db, fidelity: "implemented", note: "Airborne/gravity phase; subtract 0100h unless already faster than -5.0." },
  35: { name: "SpecialObjectType16DestroyAndAdvance", dosOffset: 0x62dd, fidelity: "deferred", note: "Needs reserved type-16 object; state-0817 update depends on its hitbox." },
  36: { name: "MovingPlatformLandingWithDisplacement", dosOffset: 0x6338, fidelity: "partial", note: "DOS Y=-6 landing and +2Ch displacement implemented; +2Ch producer/camera override are approximated." },
  37: { name: "MovingHazardDamageOrLandingTransition", dosOffset: 0x63c6, fidelity: "implemented", note: "Falling hazard region and stationary descending-feet transition path." },
  38: { name: "SpecialObjectType8HitElseDamage", dosOffset: 0x6258, fidelity: "implemented", note: "Type-8 dart point-hit interception clears projectile/transitions; miss uses normal Bart-body damage fallback." },
  39: { name: "SecondaryHitboxStopTargetVelocityX", dosOffset: 0x612e, fidelity: "deferred", note: "Needs secondary hitbox at 089Ah and linked target pointer 079Dh." },
  40: { name: "ConsumeCounter780AndMarkProgress", dosOffset: 0x619f, fidelity: "partial", note: "Counter/goals/progress loop implemented; progress-source record activation is deferred." },
  41: { name: "SecondaryHitboxDamageAndLaunchObject", dosOffset: 0x61f8, fidelity: "deferred", note: "Needs secondary hitbox/linked target HP state." },
  42: { name: "RisingObjectActivateLinkedRecords", dosOffset: 0x6440, fidelity: "partial", note: "Rising/y/latch gate implemented; writes to linked persistent source records are deferred." },
};

export const COLLISION_HANDLER_NAMES: Readonly<Record<number, string>> = Object.fromEntries(
  Object.entries(COLLISION_HANDLER_INFO).map(([index, info]) => [index, info.name]),
);

export function getCollisionHandlerInfo(index: number): CollisionHandlerInfo | null {
  return COLLISION_HANDLER_INFO[index] ?? null;
}

function u16(value: number): number {
  return value & 0xffff;
}

function s16(value: number): number {
  const v = value & 0xffff;
  return (v & 0x8000) !== 0 ? v - 0x10000 : v;
}

function wholePixelsTowardZero(fixed88: number): number {
  const value = s16(fixed88);
  return value < 0 ? -((-value) >>> 8) : value >>> 8;
}

function bcdIncrementByte(value: number): number {
  const raw = value & 0xff;
  const decimal = (((raw >>> 4) & 0x0f) * 10 + (raw & 0x0f) + 1) % 100;
  return ((Math.floor(decimal / 10) << 4) | (decimal % 10)) & 0xff;
}

function bartRect(player: BartPlayer): Rect {
  const bart = player.state;
  const left = bart.x + 2;
  const top = bart.y + 4;
  return { left, right: left + 12, top, bottom: top + 24 };
}

function objectRect(object: GameObjectRuntime, profile: CollisionProfile): Rect {
  const left = object.x + profile.x_offset;
  const top = object.y + profile.y_offset;
  return { left, right: left + profile.width, top, bottom: top + profile.height };
}

/** Matches the recovered TestBartObjectAABB_ContinueIfHit edge rules. */
function intersects(a: Rect, b: Rect): boolean {
  return a.right >= b.left && a.left < b.right && a.bottom >= b.top && a.top < b.bottom;
}

export class CollisionSystem {
  private readonly handlers: CollisionHandler[];

  constructor(
    private readonly level: LoadedLevel,
    private readonly player: BartPlayer,
    readonly state: CollisionGlobalRuntime,
    private readonly effects: CollisionGameplayEffects = NOOP_GAMEPLAY_EFFECTS,
  ) {
    // Literal index-for-index equivalent of Collision_HandlerJumpTable @ 5F67h.
    this.handlers = [
      (c) => this.h00(c), (c) => this.h01(c), (c) => this.h02(c), (c) => this.h03(c),
      (c) => this.h04(c), (c) => this.h05(c), (c) => this.h06(c), (c) => this.h07(c),
      (c) => this.h08(c), (c) => this.h09(c), (c) => this.h10(c), (c) => this.h11(c),
      (c) => this.h12(c), (c) => this.h13(c), (c) => this.h14(c), (c) => this.h15(c),
      (c) => this.h16(c), (c) => this.h17(c), (c) => this.h18(c), (c) => this.h19(c),
      (c) => this.h20(c), (c) => this.h21(c), (c) => this.h22(c), (c) => this.h23(c),
      (c) => this.h24(c), (c) => this.h25(c), (c) => this.h26(c), (c) => this.h27(c),
      (c) => this.h28(c), (c) => this.h29(c), (c) => this.h30(c), (c) => this.h31(c),
      (c) => this.h32(c), (c) => this.h33(c), (c) => this.h34(c), (c) => this.h35(c),
      (c) => this.h36(c), (c) => this.h37(c), (c) => this.h38(c), (c) => this.h39(c),
      (c) => this.h40(c), (c) => this.h41(c), (c) => this.h42(c),
    ];
  }

  reset(): void {
    this.state.levelProgress0766 = 0;
    this.state.patternState0768 = 0;
    this.state.sequenceCounter076A = 0;
    this.state.toggle076C = 0;
    this.state.specialCounter0780 = 0;
    this.state.collisionLatch0784 = 0;
    this.state.specialCounter0813 = 0;
    this.state.sprayMeter0815 = 0;
    this.state.specialState0817 = 0;
    this.state.level4Meter0781 = 0;
    this.state.level3Meter0782 = 0;
    this.state.risingActivation0823 = 0;
    this.state.inventoryCounts.fill(0);
    // Game startup seeds inventory item 2 to packed BCD 10 and item 13 to 1.
    this.state.inventoryCounts[2] = 0x10;
    this.state.inventoryCounts[13] = 0x01;
    this.state.lastDeferredHandler = null;
    this.state.lastDeferredReason = null;
  }

  /** Static terrain landing/spring path. */
  resolveStaticTerrain(previous: Position, input: BartInputState): void {
    const bart = this.player.state;
    const centerX = bart.x + 8;
    if (!bart.airborne && bart.supportKind === "object") return;

    if (!bart.airborne) {
      if (bart.supportKind === "ground" && bart.y === bart.groundY) return;
      if (bart.supportKind === "terrain" && this.hasTerrainSupport(centerX, bart.y)) return;
      this.player.loseSupport("left support");
    }
    if (s16(bart.velocityY) < 0) return;

    const candidates: Array<{ y: number; terrain: StaticTerrain | null }> = [{ y: bart.groundY, terrain: null }];
    for (const terrain of this.level.runtime.static_terrain) {
      if (centerX < terrain.x1 || centerX > terrain.x2) continue;
      candidates.push({ y: terrain.surface_y - 30, terrain });
    }

    const crossed = candidates.filter((candidate) => previous.y <= candidate.y && bart.y >= candidate.y)
      .sort((a, b) => a.y - b.y)[0];
    if (!crossed) return;

    if (crossed.terrain?.bounce) {
      bart.y = crossed.y;
      this.player.bounce(-0x0580, `terrain spring #${crossed.terrain.index}`);
    } else if (crossed.terrain) {
      this.player.land(crossed.y, "terrain", null, `terrain #${crossed.terrain.index}`);
    } else {
      this.player.land(crossed.y, "ground", null, "default ground");
    }

    // CheckStaticTerrainLanding 4E5Ah..4E6Dh applies the same Q-held fast-run
    // state after any matched static-terrain contact, including spring bounce.
    this.player.applyLandingJumpInput(input);
  }

  /** Object collision pass runs after all runtime objects have advanced. */
  resolveObjectCollisions(previousBart: Position, previousObjects: ReadonlyMap<number, Position>, objects: GameObjectRuntime[]): void {
    const bart = this.player.state;
    let maintainedObjectSupport = false;

    for (const object of objects) {
      if (!object.active || !object.collision) continue;
      const index = object.collision.collision_index;
      const handler = this.handlers[index];
      if (!handler) continue;
      const maintained = handler({
        object,
        profile: object.collision,
        previousBart,
        previousObject: previousObjects.get(object.runtimeId),
        objects,
      });
      maintainedObjectSupport ||= maintained;
    }

    if (bart.supportKind === "object" && !maintainedObjectSupport) {
      const support = bart.supportSourceIndex === null
        ? null
        : objects.find((object) => object.source.index === bart.supportSourceIndex && object.active) ?? null;
      if (!support || !support.collision || !PLATFORM_HANDLERS.has(support.collision.collision_index) || !this.isStandingOnPlatform(support, support.collision)) {
        this.player.loseSupport("left moving platform");
      }
    }
  }

  private h00(_ctx: CollisionContext): boolean { return false; }

  private h01(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.damageOrTransitionAfterHit(ctx.object, ctx.profile.parameter, "handler 1");
    return false;
  }

  private h02(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.effects.addScoreCode(0x64);
    this.effects.addLives(1);
    this.sound(ctx.object, 0x0d);
    this.consume(ctx.object, true, "handler 2 collect + counter76F");
    this.player.noteCollision(`CollectAndIncrementCounter76F: object #${ctx.object.source.index}`);
    return false;
  }

  private h03(ctx: CollisionContext): boolean {
    return this.topContactBounceBreakOrDamage(ctx.object, ctx.profile);
  }

  private h04(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    const offset = u16(ctx.profile.parameter);
    if (offset < 0x0772 || offset > 0x0780) return false;
    if (offset === 0x0780 && this.state.specialCounter0780 === 4) return false;

    this.sound(ctx.object, 2);
    this.consume(ctx.object, true, "handler 4 inventory pickup");
    if (offset === 0x0780) {
      this.state.specialCounter0780 = bcdIncrementByte(this.state.specialCounter0780);
    } else {
      const item = offset - 0x0772;
      if (item >= 0 && item < this.state.inventoryCounts.length) {
        this.state.inventoryCounts[item] = bcdIncrementByte(this.state.inventoryCounts[item] ?? 0);
        this.applyKnownInventoryPickupEffect(item);
      }
    }
    this.player.noteCollision(`CollectInventoryResource: object #${ctx.object.source.index}`);
    return false;
  }

  private h05(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.consumeObjectAndTriggerEvent7(ctx.object);
    return false;
  }

  private h06(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.effects.addScoreCode(0x90);
    this.effects.addScoreCode(0x10);
    this.sound(ctx.object, 8);
    this.consume(ctx.object, false, "handler 6 objective consumed");
    this.state.levelProgress0766 = u16(this.state.levelProgress0766 + 1);
    this.player.noteCollision(`CollectObjectiveAndAdvanceSequence: object #${ctx.object.source.index}`);
    this.defer(6, "External progression-table/script-PC update after collection is not modeled.");
    return false;
  }

  private h07(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    const launchIndex = ctx.object.flags & 0x0f;
    this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    if (!ctx.object.active) return false;
    ctx.object.flags &= 0xfff0;
    const launch: Record<number, [number, number]> = {
      0: [0x0000, 0xfb00],
      4: [0xff00, 0xfc00],
      8: [0x0100, 0xfc00],
    };
    const pair = launch[launchIndex];
    if (pair) {
      ctx.object.velocityX = s16(pair[0]);
      ctx.object.velocityY = s16(pair[1]);
      if (ctx.object.velocityX !== 0) ctx.object.runtimeFlags = u16(ctx.object.runtimeFlags | 0x0080);
    }
    this.player.noteCollision(`TransitionObjectAndLaunch: object #${ctx.object.source.index}`);
    return false;
  }

  private h08(ctx: CollisionContext): boolean {
    if (!this.player.state.airborne || !this.testAabb(ctx.object, ctx.profile)) return false;
    this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    return false;
  }

  private h09(ctx: CollisionContext): boolean {
    if (this.player.state.airborne || !this.testAabb(ctx.object, ctx.profile)) return false;
    this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    return false;
  }

  private h10(ctx: CollisionContext): boolean {
    this.resolveHorizontalSolid(ctx.object, ctx.profile, ctx.previousBart);
    return false;
  }

  private h11(ctx: CollisionContext): boolean {
    return this.resolveObjectPlatform(ctx.object, ctx.profile, ctx.previousBart, ctx.previousObject, 11);
  }

  private h12(ctx: CollisionContext): boolean {
    return this.resolveObjectPlatform(ctx.object, ctx.profile, ctx.previousBart, ctx.previousObject, 12);
  }

  private h13(ctx: CollisionContext): boolean {
    const bart = this.player.state;
    if (!bart.airborne || s16(bart.velocityY) < 0 || !this.testAabb(ctx.object, ctx.profile)) return false;
    this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    return false;
  }

  private h14(_ctx: CollisionContext): boolean { return false; } // secondary hitbox only; body AABB would be wrong

  private h15(ctx: CollisionContext): boolean {
    const action = this.state.inventory.actionHitbox;
    if (!this.state.inventory.actionActive || !action?.active) return false;
    const object = objectRect(ctx.object, ctx.profile);
    if (!(action.right >= object.left && action.left < object.right && action.y >= object.top && action.y < object.bottom)) return false;

    const low5 = ctx.object.flags & 0x1f;
    if (low5 !== 0) {
      ctx.object.flags = (ctx.object.flags & 0xffe0) | ((low5 - 1) & 0x1f);
      this.player.noteCollision(`BartActionHitObject counter: object #${ctx.object.source.index}`);
      return false;
    }

    if (s16(ctx.profile.parameter) !== 0) {
      this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    } else {
      this.effects.decrementGoals();
      this.consume(ctx.object, true, "handler 15 action hit consumed object");
    }
    this.player.noteCollision(`BartActionHitObject: object #${ctx.object.source.index}`);
    return false;
  }

  private h16(ctx: CollisionContext): boolean {
    const p = this.state.inventory.projectile;
    if (!p?.active || p.typeOffset !== 0x0002 || p.y < 0x008e || p.x < 0x0b28 || p.x > 0x0b60) return false;
    this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    this.player.noteCollision(`SpecialObjectType2RegionTransition: object #${ctx.object.source.index}`);
    return false;
  }

  private h17(ctx: CollisionContext): boolean {
    const p = this.state.inventory.projectile;
    if (!p?.active || p.typeOffset !== 0x0004 || s16(p.velocityX) !== 0) return false;
    if (!this.projectilePointHits(ctx, p.x + 8, p.y + 6)) return false;
    this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    this.player.noteCollision(`SpecialObjectType4HitTransition: object #${ctx.object.source.index}`);
    return false;
  }

  private h18(_ctx: CollisionContext): boolean { return false; } // reserved type-6 projectile + boss HP still deferred

  private h19(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.effects.addScoreCode(0x50);
    this.player.grantInvulnerability(0xfa);
    this.consume(ctx.object, true, "handler 19 invulnerability pickup");
    this.player.noteCollision(`CollectInvulnerabilityPickup: object #${ctx.object.source.index}`);
    return false;
  }

  private h20(ctx: CollisionContext): boolean {
    // DOS 6E50h does not test Bart AABB. It follows the configured source
    // pointer at DS:08D6/08D8, and while bit 8000h is active decrements the
    // *low byte* once per collision pass. Reaching zero advances the profile
    // to its transition parameter and tail-jumps through the common handler.
    const flags = this.effects.externalCountdownSourceFlags();
    if (flags === null || (flags & 0x8000) === 0) return false;
    const low = ((flags & 0xff) - 1) & 0xff;
    this.effects.setExternalCountdownSourceFlags((flags & 0xff00) | low);
    if (low === 0) this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    return false;
  }
  private h21(_ctx: CollisionContext): boolean { return false; } // linked-source lookup; no Bart body test

  private h22(ctx: CollisionContext): boolean {
    const feet = bartRect(this.player);
    feet.top += 0x14;
    if (!this.testAabbWithBartRect(ctx.object, ctx.profile, feet)) return false;
    this.damageOrTransitionAfterHit(ctx.object, ctx.profile.parameter, "handler 22 feet-only");
    return false;
  }

  private h23(ctx: CollisionContext): boolean {
    // Profile xOffset stores a typeOffset for the linked object, and parameter
    // stores the transition after the profile's +8 position in the DOS code.
    const linkedTypeOffset = u16(ctx.profile.x_offset);
    const linked = ctx.objects.find((o) => o.active && o.typeOffset === linkedTypeOffset) ?? null;
    if (!linked || linked.y > 0x32) return false;
    if (ctx.object.x > linked.x + 0x14 || ctx.object.x + 8 < linked.x) return false;
    this.consume(ctx.object, false, "handler 23 proximity source consumed");
    this.applyTransitionIfValid(linked, ctx.profile.parameter);
    this.player.noteCollision(`LinkedObjectProximityTransition: #${ctx.object.source.index} -> type ${linked.typeId}`);
    return false;
  }

  private h24(ctx: CollisionContext): boolean {
    const p = this.state.inventory.projectile;
    if (p?.active && p.typeOffset === 0x0008 && this.projectilePointHits(ctx, p.x + 4, p.y)) {
      this.clearProjectile();
      this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
      this.player.noteCollision(`SpecialObjectType8HitElseHazard projectile hit: object #${ctx.object.source.index}`);
      return false;
    }
    // Exact miss/no-projectile path falls into Collision_ConsumeObjectAndTriggerEvent7.
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.consumeObjectAndTriggerEvent7(ctx.object);
    return false;
  }

  private h25(_ctx: CollisionContext): boolean { return false; } // reserved action object type 10 only
  private h26(_ctx: CollisionContext): boolean { return false; } // reserved action object type 12 only

  private h27(ctx: CollisionContext): boolean {
    const p = this.state.inventory.projectile;
    if (p?.active && p.typeOffset === 0x000e && p.y >= 0 && this.projectilePointHits(ctx, p.x + 2, p.y)) {
      this.clearProjectile();
      this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
      this.player.noteCollision(`SpecialObjectType14HitElseEvent projectile hit: object #${ctx.object.source.index}`);
      return false;
    }
    if ((ctx.object.flags & 1) !== 0 || !this.testAabb(ctx.object, ctx.profile)) return false;
    this.consumeObjectAndTriggerEvent7(ctx.object);
    return false;
  }

  private h28(ctx: CollisionContext): boolean {
    const object = ctx.object;
    const bart = bartRect(this.player);
    if (s16(object.velocityY) > 0) {
      const customHit = object.x <= bart.right && object.x + 0x48 >= bart.left && object.y + 0x32 >= bart.top;
      if (customHit && this.player.takeHit(`FallingLargeObjectHazard: object #${object.source.index}`)) return false;
    }
    return this.topContactBounceBreakOrDamage(object, ctx.profile);
  }

  private h29(ctx: CollisionContext): boolean {
    if ((ctx.object.motionReferenceX & 0xff) !== 0) return false;
    return this.h01(ctx);
  }

  private h30(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    if (this.state.collisionLatch0784 !== 0 || this.state.levelProgress0766 !== 0x0f || this.state.specialCounter0780 === 4) return false;
    this.state.specialCounter0780 = (this.state.specialCounter0780 + 1) & 0xff;
    this.state.collisionLatch0784 = 0xff;
    this.player.noteCollision(`AABBIncrementCounter780IfReady: object #${ctx.object.source.index}`);
    return false;
  }

  private h31(ctx: CollisionContext): boolean {
    if (!this.player.state.airborne || !this.testAabb(ctx.object, ctx.profile)) return false;
    const flagsNibble = ctx.object.flags & 0x0f;
    const patternIndex = (this.state.patternState0768 >>> 1) % AIRBORNE_PATTERN.length;
    if (AIRBORNE_PATTERN[patternIndex] !== flagsNibble) return false;
    this.state.patternState0768 += 2;
    if (this.state.patternState0768 === 0x12) this.state.patternState0768 = 0;
    this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    this.player.noteCollision(`AirbornePatternMatchTransition: pattern ${patternIndex}`);
    return false;
  }

  private h32(ctx: CollisionContext): boolean {
    if (this.state.sequenceCounter076A === 0x1c || !this.testAabb(ctx.object, ctx.profile)) return false;
    this.effects.addScoreCode(0x50);
    this.state.sequenceCounter076A = u16(this.state.sequenceCounter076A + 4);
    this.consume(ctx.object, true, "handler 32 sequence pickup");
    this.player.noteCollision(`CollectAndAdvanceCounter76A: ${this.state.sequenceCounter076A.toString(16)}h`);
    return false;
  }

  private h33(ctx: CollisionContext): boolean {
    this.state.toggle076C = 0;
    const maintained = this.resolveObjectPlatform(ctx.object, ctx.profile, ctx.previousBart, ctx.previousObject, 12);
    if (this.state.sequenceCounter076A === 0x1c) this.state.toggle076C = u16(~this.state.toggle076C);
    return maintained;
  }

  private h34(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.player.bounceUpwardStep(`BounceBartUpward: object #${ctx.object.source.index}`);
    return false;
  }

  private h35(_ctx: CollisionContext): boolean { return false; } // reserved action object type 16 only

  private h36(ctx: CollisionContext): boolean {
    const bart = this.player.state;
    if (s16(bart.velocityY) < 0) return false;
    const centerX = bart.x + 8;
    const left = ctx.object.x + ctx.profile.x_offset;
    const right = left + ctx.profile.width;
    if (centerX < left || centerX > right) return false;
    const target = ctx.object.y + ctx.profile.y_offset;
    if (bart.y < target - 1 || bart.y > target + 8) return false;

    const wasSupported = bart.supportKind === "object" && bart.supportSourceIndex === ctx.object.source.index;
    const referenceX = ctx.object.motionReferenceX !== 0
      ? ctx.object.motionReferenceX
      : (ctx.previousObject?.x ?? ctx.object.x);
    const dx = ctx.object.x - referenceX;
    bart.x = Math.max(0, Math.min(bart.maxX, bart.x + dx));
    this.player.land(target - 6, "object", ctx.object.source.index,
      `MovingPlatformLandingWithDisplacement: object #${ctx.object.source.index}`);
    if (!wasSupported) this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
    return true;
  }

  private h37(ctx: CollisionContext): boolean {
    const object = ctx.object;
    const bart = bartRect(this.player);
    if (s16(object.velocityY) > 0) {
      const hazardLeft = object.x + 8;
      const customHit = hazardLeft <= bart.right && hazardLeft + 0x20 >= bart.left && object.y >= 0 && object.y + 0x50 >= bart.top;
      if (customHit && this.player.takeHit(`MovingHazardDamage: object #${object.source.index}`)) return false;
    }
    if (s16(object.velocityY) !== 0) return false;
    if (!this.player.state.airborne || s16(this.player.state.velocityY) < 0) return false;
    const rect = objectRect(object, ctx.profile);
    if (bart.right < rect.left || bart.left >= rect.right || bart.bottom < rect.top || bart.bottom >= rect.bottom) return false;
    this.applyTransitionIfValid(object, ctx.profile.parameter);
    this.player.noteCollision(`MovingHazardLandingTransition: object #${object.source.index}`);
    return false;
  }

  private h38(ctx: CollisionContext): boolean {
    const p = this.state.inventory.projectile;
    if (p?.active && p.typeOffset === 0x0008 && this.projectilePointHits(ctx, p.x + 4, p.y)) {
      this.clearProjectile();
      this.applyTransitionIfValid(ctx.object, ctx.profile.parameter);
      this.player.noteCollision(`SpecialObjectType8HitElseDamage projectile hit: object #${ctx.object.source.index}`);
      return false;
    }
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    this.player.takeHit(`SpecialObjectType8HitElseDamage fallback: object #${ctx.object.source.index}`);
    return false;
  }

  private h39(_ctx: CollisionContext): boolean { return false; } // secondary hitbox only

  private h40(ctx: CollisionContext): boolean {
    if (!this.testAabb(ctx.object, ctx.profile)) return false;
    let iterations = 0;
    while (this.state.specialCounter0780 !== 0 && iterations++ < 0x100) {
      this.state.specialCounter0780 = (this.state.specialCounter0780 - 1) & 0xff;
      this.effects.decrementGoals();
      this.state.levelProgress0766 = u16(this.state.levelProgress0766 + 1);
    }
    if (iterations > 0) {
      this.player.noteCollision(`ConsumeCounter780AndMarkProgress: ${iterations} step(s)`);
      this.defer(40, "Progress-source record activation (scriptPC=8000h) is not yet modeled.");
    }
    return false;
  }

  private h41(_ctx: CollisionContext): boolean { return false; } // secondary hitbox only

  private h42(ctx: CollisionContext): boolean {
    if (this.state.risingActivation0823 !== 0 || s16(ctx.object.velocityY) >= 0 || ctx.object.y > 0x29) return false;
    this.state.risingActivation0823 = 0xff;
    this.player.noteCollision(`RisingObjectActivateLinkedRecords: object #${ctx.object.source.index}`);
    this.defer(42, "Linked persistent source records should receive 8000h activation flags; source mutation table is not modeled.");
    return false;
  }

  private projectilePointHits(ctx: CollisionContext, x: number, y: number): boolean {
    const rect = objectRect(ctx.object, ctx.profile);
    // Recovered special-object handlers use left <= point < right and top <= point <= bottom.
    return x >= rect.left && x < rect.right && y >= rect.top && y <= rect.bottom;
  }

  private clearProjectile(): void {
    const p = this.state.inventory.projectile;
    if (p) p.active = false;
    this.state.inventory.projectile = null;
    this.state.inventory.transientObjects = this.state.inventory.transientObjects.filter((candidate) => candidate.active);
  }

  private hasTerrainSupport(centerX: number, bartY: number): boolean {
    return this.level.runtime.static_terrain.some((terrain) =>
      !terrain.bounce && centerX >= terrain.x1 && centerX <= terrain.x2 && terrain.surface_y - 30 === bartY,
    );
  }

  private testAabb(object: GameObjectRuntime, profile: CollisionProfile): boolean {
    return this.testAabbWithBartRect(object, profile, bartRect(this.player));
  }

  private testAabbWithBartRect(object: GameObjectRuntime, profile: CollisionProfile, bart: Rect): boolean {
    // DOS does not reject zero-sized axes. This matters for Level-1's
    // clothesline sheets: their height=0 profile is an intentional horizontal
    // trigger line hit by BartBottom with the helper's inclusive >= edge.
    if (profile.width < 0 || profile.height < 0) return false;
    return intersects(bart, objectRect(object, profile));
  }

  private resolveHorizontalSolid(object: GameObjectRuntime, profile: CollisionProfile, previousBart: Position): void {
    if (!this.testAabb(object, profile)) return;
    const bart = this.player.state;
    const rect = objectRect(object, profile);
    const previousLeft = previousBart.x + 2;
    const previousRight = previousLeft + 12;
    if (previousRight <= rect.left) bart.x = rect.left - 14;
    else if (previousLeft >= rect.right) bart.x = rect.right - 2;
    else {
      const current = bartRect(this.player);
      const pushLeft = current.right - rect.left;
      const pushRight = rect.right - current.left;
      bart.x += pushLeft <= pushRight ? -pushLeft : pushRight;
    }
    bart.x = Math.max(0, Math.min(bart.maxX, bart.x));
    bart.velocityX = 0;
    this.player.noteCollision(`solid object #${object.source.index} handler 10`);
  }

  private resolveObjectPlatform(
    object: GameObjectRuntime,
    profile: CollisionProfile,
    previousBart: Position,
    previousObject: Position | undefined,
    semantics: 11 | 12,
  ): boolean {
    const bart = this.player.state;
    if ((object.flags & 0x0080) !== 0 && semantics === 12) return false;
    if (s16(bart.velocityY) < 0) return false;

    const centerX = bart.x + 8;
    const left = object.x + profile.x_offset;
    const right = left + profile.width;
    if (centerX < left || centerX > right) return false;

    const landingY = object.y + profile.y_offset;
    const wasSupported = bart.supportKind === "object" && bart.supportSourceIndex === object.source.index;
    const toleranceAbove = semantics === 12 ? 1 : 2;
    const nearTop = bart.y >= landingY - toleranceAbove && bart.y <= landingY + 8;
    const crossed = previousBart.y <= landingY && bart.y >= landingY;
    if (!wasSupported && !crossed && !nearTop) return false;

    const objectDeltaX = previousObject ? object.x - previousObject.x : wholePixelsTowardZero(object.velocityX);
    if (wasSupported && semantics === 12 && objectDeltaX !== 0) {
      bart.x = Math.max(0, Math.min(bart.maxX, bart.x + objectDeltaX));
    }

    if (!wasSupported) {
      this.player.land(landingY, "object", object.source.index, `platform object #${object.source.index} handler ${profile.collision_index}`);
      if (semantics === 11) {
        const lowCounter = object.flags & 0xff;
        if (lowCounter !== 0) {
          const nextCounter = (lowCounter - 1) & 0xff;
          object.flags = (object.flags & 0xff00) | nextCounter;
          if (nextCounter === 0) this.applyTransitionIfValid(object, profile.parameter);
        }
      } else {
        this.applyTransitionIfValid(object, profile.parameter);
      }
    } else {
      this.player.land(landingY, "object", object.source.index);
    }
    return true;
  }

  private isStandingOnPlatform(object: GameObjectRuntime, profile: CollisionProfile): boolean {
    const bart = this.player.state;
    const centerX = bart.x + 8;
    const left = object.x + profile.x_offset;
    const right = left + profile.width;
    const landingY = object.y + profile.y_offset;
    if (profile.collision_index === 36) return centerX >= left && centerX <= right && Math.abs(bart.y - (landingY - 6)) <= 1;
    return centerX >= left && centerX <= right && Math.abs(bart.y - landingY) <= 1;
  }

  private topContactBounceBreakOrDamage(object: GameObjectRuntime, profile: CollisionProfile): boolean {
    const bart = this.player.state;
    const b = bartRect(this.player);
    const o = objectRect(object, profile);
    const topContact = b.right >= o.left && b.left < o.right && b.bottom >= o.top && b.bottom < o.bottom && s16(bart.velocityY) > 0;
    if (!topContact) return false;

    if ((object.flags & 0x0080) !== 0) {
      this.player.reflectVelocity(`TopContact counter bounce: object #${object.source.index}`);
      const low = ((object.flags & 0xff) - 1) & 0xff;
      object.flags = (object.flags & 0xff00) | low;
      if ((low & 0x7f) === 0) {
        for (let i = 0; i < 5; i++) {
          this.effects.addScoreCode(0x90);
          this.effects.addScoreCode(0x10);
        }
        this.applyTransitionIfValid(object, profile.parameter);
      }
      return true;
    }

    const hadFlag0400 = (object.flags & 0x0400) !== 0;
    object.flags = u16(object.flags & ~0x0400);
    if (hadFlag0400) {
      this.player.reflectVelocity(`TopContact break bounce: object #${object.source.index}`);
      this.effects.addScoreCode(0x90);
      this.effects.addScoreCode(0x10);
      this.effects.addScoreCode(0x90);
      this.effects.addScoreCode(0x10);
      this.sound(object, 5);
      this.applyTransitionIfValid(object, profile.parameter);
    } else {
      this.player.takeHit(`TopContact damage: object #${object.source.index}`);
    }
    return true;
  }

  private damageOrTransitionAfterHit(object: GameObjectRuntime, rawParameter: number, label: string): void {
    const parameter = s16(rawParameter);
    if ((parameter & 1) !== 0) {
      // Handler 1 only clears the runtime object's flags here; it does not use
      // DetachSourceAndDespawnObject for this odd-parameter branch.
      this.consume(object, false, `${label}: odd parameter cleared runtime object`);
    } else if (parameter !== 0) {
      this.applyTransitionIfValid(object, parameter);
      return; // DOS tail-jumps to transition and does not apply damage here.
    }
    this.player.takeHit(`${label}: object #${object.source.index}`);
  }

  private consumeObjectAndTriggerEvent7(object: GameObjectRuntime): void {
    this.effects.addScoreCode(0x90);
    this.effects.addScoreCode(0x10);
    this.sound(object, 7);
    this.effects.decrementGoals();
    this.consume(object, true, "event7 collect/consume");
    this.player.noteCollision(`ConsumeObjectAndTriggerEvent7: object #${object.source.index}`);
  }

  private applyKnownInventoryPickupEffect(item: number): void {
    const count = this.state.inventoryCounts[item] ?? 0;
    if (item === 2) {
      this.effects.addScoreCode(0x50);
      if (count >= 0x15) {
        this.state.inventoryCounts[item] = (count - 0x10) & 0xff;
        this.effects.addLives(1);
      }
    } else if (item === 3 && count <= 1) {
      this.state.sprayMeter0815 = 0x1b;
    } else if (item === 10 && count <= 1) {
      this.state.level3Meter0782 = 0x0c;
    } else if (item === 11 && count <= 1) {
      this.state.level4Meter0781 = 0x0c;
    }
  }

  private consume(object: GameObjectRuntime, detachSource: boolean, reason: string): void {
    if (object.sourceAttached) {
      object.source.flags = detachSource ? 0 : (object.source.flags & ~0x4000);
    }
    object.flags = 0;
    object.active = false;
    if (detachSource) object.sourceAttached = false;
    object.runtimeFlags = 0;
    object.vmState = "despawned";
    object.vmMessage = reason;
  }

  private sound(object: GameObjectRuntime, soundId: number): void {
    object.lastSoundId = soundId & 0xffff;
  }

  private defer(index: number, reason: string): void {
    this.state.lastDeferredHandler = index;
    this.state.lastDeferredReason = reason;
  }


  /** Implements ApplyObjectCollisionTransition + ApplySignedCollisionTypeTransition where the target is modeled. */
  private applyTransitionIfValid(object: GameObjectRuntime, rawParameter: number): void {
    let transition = s16(rawParameter);
    if (transition === 0) return;

    if (transition < 0) {
      this.effects.addScoreCode(0x90);
      this.effects.addScoreCode(0x10);
      this.sound(object, 7);
      this.effects.decrementGoals();
      transition = -transition;
      if ((transition & 1) !== 0) {
        this.consume(object, true, `Collision transition ${rawParameter} detached/despawned object.`);
        return;
      }
    }

    if ((transition & 1) !== 0) return;
    const typeId = transition >>> 1;
    const flow = this.level.flowByType.get(typeId);
    if (!flow) return;

    object.flags = u16(object.flags & ~0x1000);
    object.typeOffset = transition;
    object.typeId = typeId;
    object.flow = flow;
    object.collision = this.level.collisionByType.get(typeId) ?? null;
    object.scriptPC = flow.entry_offset;
    object.scriptDelay = 0;
    object.velocityX = 0;
    object.velocityY = 0;
    object.accelerationX = 0;
    object.accelerationY = 0;
    object.fractionX = 0;
    object.fractionY = 0;
    object.runtimeFlags &= ~0x0001;
    object.vmState = "ready";
    object.vmMessage = `Collision transitioned object to type ${typeId}.`;
  }
}
