import { BartPlayer } from "./BartPlayer.js";
import type { LevelBartActionMode } from "./levels/LevelHandlers.js";
import {
  BartInputState,
  CollisionGlobalRuntime,
  InventoryItemDefinition,
  InventoryProjectileRuntime,
  InventoryRuntime,
  LoadedLevel,
} from "./types.js";

export const INVENTORY_ITEMS: readonly InventoryItemDefinition[] = [
  { id: 0, name: "EXIT",        iconOffset: 0x0000, nameOffset: 0x1267 },
  { id: 1, name: "X-RAY SPECS", iconOffset: 0x1424, nameOffset: 0x1273 },
  { id: 2, name: "COIN",        iconOffset: 0x2810, nameOffset: 0x127f },
  { id: 3, name: "SPRAYCAN",    iconOffset: 0x2804, nameOffset: 0x128b },
  { id: 4, name: "CHERRY BOMB", iconOffset: 0x2808, nameOffset: 0x1297 },
  { id: 5, name: "ROCKET",      iconOffset: 0x280c, nameOffset: 0x12a3 },
  { id: 6, name: "WRENCH",      iconOffset: 0x2800, nameOffset: 0x12af },
  { id: 7, name: "MAGNET",      iconOffset: 0x2818, nameOffset: 0x12c7 },
  { id: 8, name: "WHISTLE",     iconOffset: 0x2814, nameOffset: 0x12d3 },
  { id: 9, name: "DONUTS",      iconOffset: 0x2824, nameOffset: 0x12df },
  { id: 10, name: "SLINGSHOT",  iconOffset: 0x281c, nameOffset: 0x12eb },
  { id: 11, name: "DART GUN",   iconOffset: 0x2820, nameOffset: 0x12f7 },
  { id: 12, name: "KEY",        iconOffset: 0x1e24, nameOffset: 0x12bb },
  { id: 13, name: "PAUSE",      iconOffset: 0x0000, nameOffset: 0x1303 },
];

export interface InventoryEffects {
  setHudEvent(message: string): void;
  addLives(count: number): void;
  addScoreCode(code: number): void;
  activateSourceRecord(offset: number | undefined, flags: number, mode?: "or" | "set"): boolean;
  sourceFlags(offset: number | undefined): number | null;
  teleportBart(x: number): void;
  handleLevelInventoryItemUse?(event: import("./levels/LevelHandlers.js").LevelInventoryItemUseEvent): boolean;
}

function s16(value: number): number {
  const v = value & 0xffff;
  return (v & 0x8000) !== 0 ? v - 0x10000 : v;
}

function u16(value: number): number { return value & 0xffff; }

function bcdToNumber(value: number): number {
  const b = value & 0xff;
  return ((b >>> 4) & 0x0f) * 10 + (b & 0x0f);
}

function numberToBcd(value: number): number {
  const n = Math.max(0, Math.min(99, Math.trunc(value)));
  return (((Math.trunc(n / 10) & 0x0f) << 4) | (n % 10)) & 0xff;
}

function decrementBcd(value: number): number {
  return numberToBcd(Math.max(0, bcdToNumber(value) - 1));
}

function createProjectile(
  kind: InventoryProjectileRuntime["kind"],
  typeOffset: number,
  x: number,
  y: number,
  velocityX: number,
  velocityY: number,
  accelerationY: number,
  lifetime: number,
): InventoryProjectileRuntime {
  return { active: true, kind, typeOffset, x, y, velocityX, velocityY, accelerationY, lifetime };
}

export function createInventoryRuntime(): InventoryRuntime {
  return {
    selectedItem: 1,
    modeHeld: false,
    repeatTimer: 0,
    displayTimeout: 0xfa,
    alternateGraphicsTimer: 0,
    bartActionState: 0,
    actionActive: false,
    actionCooldown: 0,
    spraySubCounter0816: 0,
    magnetTrigger081F: 0,
    actionHitbox: null,
    actionVisual: null,
    projectile: null,
    transientObjects: [],
    pauseRequested: false,
    lastAction: null,
    lastSoundId: null,
  };
}

/**
 * High-level reconstruction of UpdateInventorySelection +
 * UpdateBartActionAndWeaponState. Counts remain the packed-BCD bytes from
 * DS:0772..077F, while the popup/selection latches retain their DOS timings.
 */
export class InventorySystem {
  private previousInventory = false;
  private previousAction = false;
  private sprayVisualTimer = 0;
  private sprayVisualFrame = 0;

  constructor(
    private readonly level: LoadedLevel,
    private readonly player: BartPlayer,
    private readonly collisionState: CollisionGlobalRuntime,
    private readonly effects: InventoryEffects,
  ) {}

  get state(): InventoryRuntime { return this.collisionState.inventory; }
  get counts(): number[] { return this.collisionState.inventoryCounts; }

  reset(): void {
    const next = createInventoryRuntime();
    Object.assign(this.state, next);
    this.state.transientObjects = [];
    this.previousInventory = false;
    this.previousAction = false;
    this.sprayVisualTimer = 0;
    this.sprayVisualFrame = 0;
  }

  /** Weapon/action pass: DOS runs this after UpdateBart and before object scripts/collisions. */
  beginTick(input: BartInputState, actionMode: LevelBartActionMode = "normal"): void {
    const action = !!input.action;
    const inv = this.state;

    if (inv.alternateGraphicsTimer > 0 && inv.alternateGraphicsTimer !== 0xfa) {
      inv.alternateGraphicsTimer = Math.max(0, inv.alternateGraphicsTimer - 1);
    }
    if (inv.actionCooldown > 0) inv.actionCooldown--;

    this.stepProjectiles();
    if (actionMode !== "suppress-all") this.stepLatchedItemAction();

    // DOS UpdateBartActionAndWeaponState sets g_BartAnimationBase=18h while
    // any of the three FIRE weapons is available, and UpdateBartAnimation
    // adds another +18h while the spray/action hitbox is active.
    const hasFireWeapon = bcdToNumber(this.counts[3] ?? 0) > 0 || bcdToNumber(this.counts[11] ?? 0) > 0 || bcdToNumber(this.counts[10] ?? 0) > 0;
    this.player.state.animationBase = hasFireWeapon ? 0x18 : 0;

    inv.actionActive = false;
    inv.actionHitbox = null;
    inv.actionVisual = null;
    const runningJump = this.player.state.airborne && this.player.state.velocityX !== 0 && this.player.state.maxSpeedX === 0x0400;
    if (actionMode === "normal" && !runningJump && !inv.modeHeld && action && inv.actionCooldown === 0 && inv.bartActionState === 0) {
      // The original action routine prioritizes the three level weapons by
      // availability, not by the popup selection itself.
      if (bcdToNumber(this.counts[3] ?? 0) > 0) this.stepSpraycan();
      else if (bcdToNumber(this.counts[11] ?? 0) > 0) this.fireMeterWeapon("dart");
      else if (bcdToNumber(this.counts[10] ?? 0) > 0) this.fireMeterWeapon("slingshot");
    }

    if (!action && this.previousAction && !this.previousInventory) inv.actionCooldown = 0x0a;
  }

  /** Inventory selection/use pass: mirrors its later UpdateGameplayTimers slot. */
  endTick(input: BartInputState, suppressed = false): void {
    if (suppressed) return;
    const inventoryHeld = !!(input.down || input.inventory);
    const action = !!input.action;
    const inv = this.state;

    if (inventoryHeld) {
      inv.modeHeld = true;
      inv.displayTimeout = 0xfa;
      if (!this.previousInventory) inv.repeatTimer = 0;

      if (inv.repeatTimer > 0) inv.repeatTimer--;
      if (action && (!this.previousAction || inv.repeatTimer === 0)) {
        inv.repeatTimer = 0x14;
        this.advanceSelection();
      }
    } else {
      if (this.previousInventory) this.useSelectedItem();
      inv.modeHeld = false;
      inv.repeatTimer = 0;
      if (inv.displayTimeout > 0) inv.displayTimeout--;
    }

    this.previousInventory = inventoryHeld;
    this.previousAction = action;
  }

  consumePauseRequest(): boolean {
    if (!this.state.pauseRequested) return false;
    this.state.pauseRequested = false;
    return true;
  }

  selectedDefinition(): InventoryItemDefinition {
    return INVENTORY_ITEMS[this.state.selectedItem] ?? INVENTORY_ITEMS[1]!;
  }

  itemCountNumber(index: number): number {
    if (index === 0 || index === 1) return 1;
    return bcdToNumber(this.counts[index] ?? 0);
  }

  private advanceSelection(): void {
    let item = this.state.selectedItem;
    for (let guard = 0; guard < 14; guard++) {
      item++;
      if (item > 13) item = 0;
      if (item <= 1 || this.itemCountNumber(item) > 0) {
        this.state.selectedItem = item;
        this.state.lastAction = `Selected ${INVENTORY_ITEMS[item]!.name}`;
        this.effects.setHudEvent(this.state.lastAction);
        return;
      }
    }
  }

  private useSelectedItem(): void {
    const item = this.state.selectedItem;
    if (this.state.bartActionState !== 0) return;
    const name = INVENTORY_ITEMS[item]?.name ?? `ITEM ${item}`;

    // Single typed event point for level-specific inventory semantics. Future
    // Level 2-5 handlers can intercept any item without adding level checks to
    // this switch; unhandled items continue through the common DOS behavior.
    if (this.effects.handleLevelInventoryItemUse?.(this.levelInventoryEvent(item)) ?? false) return;

    switch (item) {
      case 0:
        this.state.selectedItem = 1;
        this.note("EXIT inventory");
        break;
      case 1:
        if (this.level.level !== 5) {
          this.state.alternateGraphicsTimer = this.state.alternateGraphicsTimer === 0 ? 0xfa : 0;
          this.note(`X-RAY SPECS ${this.state.alternateGraphicsTimer ? "ON" : "OFF"}`);
        }
        break;
      case 2:
        this.useCoin();
        break;
      case 3:
      case 10:
      case 11:
        // Exact jump-table entries reset the selector; FIRE is handled in the
        // separate Bart action/weapon pass when these counts are non-zero.
        this.state.selectedItem = 1;
        this.note(`${name} ready on FIRE`);
        break;
      case 4:
        if (this.consumeItem(4)) {
          this.state.bartActionState = 2;
          this.note("CHERRY BOMB action state 2");
        }
        break;
      case 5:
        if (this.consumeItem(5)) {
          this.state.bartActionState = 4;
          this.note("ROCKET action state 4");
        }
        break;
      case 6:
        this.useWrench();
        break;
      case 7:
        if (this.level.level === 3 && this.player.state.x >= 0x194 && this.player.state.x <= 0x200) {
          this.state.magnetTrigger081F = 0xff;
          this.state.selectedItem = 1;
          this.note("MAGNET trigger 081F=FF");
        } else this.resetSelection(`${name}: wrong location`);
        break;
      case 8:
        this.useWhistle();
        break;
      case 9:
        if (this.consumeItem(9)) {
          this.spawnTransient(createProjectile("donut", 0, this.player.state.x, this.player.state.y - 40, 0, 0x0080, 0x0020, 90));
          this.note("DONUTS transient spawned");
        }
        break;
      case 12:
        this.useKey();
        break;
      case 13:
        this.state.pauseRequested = true;
        this.note("PAUSE");
        break;
      default:
        break;
    }
  }

  private levelInventoryEvent(itemId: number): import("./levels/LevelHandlers.js").LevelInventoryItemUseEvent {
    return {
      itemId,
      bart: this.player.state,
      itemCount: (index) => this.itemCountNumber(index),
      consumeItem: (index) => this.consumeItem(index),
      resetSelection: (message) => this.resetSelection(message),
      note: (message) => this.note(message),
    };
  }

  private useCoin(): void {
    // Common DOS fallback: the original inventory routine itself is not
    // level-number gated and follows LevelRuntimeConfig.progress_source_offset.
    if (this.itemCountNumber(2) <= 0 || this.player.state.y !== 0x62 || (this.player.state.x >>> 3) !== 0x69) {
      this.resetSelection("COIN: wrong location");
      return;
    }
    const offset = this.level.playerConfig.progress_source_offset;
    const flags = this.effects.sourceFlags(offset);
    if (flags === null || flags === 0) {
      this.resetSelection("COIN: source inactive");
      return;
    }
    this.effects.activateSourceRecord(offset, 0x8000, "or");
    this.consumeItem(2);
    this.note("COIN source activated");
  }

  private useWrench(): void {
    const x = this.player.state.x;
    if (x < 0x710 || x > 0x728) {
      this.resetSelection("WRENCH: wrong location");
      return;
    }
    const offset = this.level.playerConfig.inventory_item6_source_offset;
    const flags = this.effects.sourceFlags(offset);
    if (flags === null) {
      this.resetSelection("WRENCH: no level source");
      return;
    }
    if ((flags & 0x8000) === 0) this.effects.activateSourceRecord(offset, 0x803f, "set");
    this.note("WRENCH source activated (803Fh)");
  }

  private useWhistle(): void {
    const x = this.player.state.x;
    const offset = this.level.playerConfig.inventory_item8_source_offset;
    const flags = this.effects.sourceFlags(offset);
    if (x < 0x2d30 || x > 0x2d80 || flags === null || (flags & 1) === 0) {
      this.resetSelection("WHISTLE: wrong location/source state");
      return;
    }
    this.effects.activateSourceRecord(offset, 0x8000, "set");
    this.note("WHISTLE sound 0Fh + source activated");
  }

  private useKey(): void {
    const x16 = this.player.state.x & 0xfff0;
    if (x16 === 0x0430) {
      this.effects.teleportBart(0x2abc + 0x88);
      this.note("KEY teleport -> 2B44h");
      return;
    }
    if (x16 === 0x2b40) {
      this.effects.teleportBart(0x03ad + 0x88);
      this.note("KEY teleport -> 0435h");
      return;
    }
    this.resetSelection("KEY: wrong location");
  }

  private stepSpraycan(): void {
    const inv = this.state;
    const bart = this.player.state;
    inv.actionActive = true;
    inv.lastSoundId = 0x01;
    // DOS builds the reserved action object at BartY+10. Handler 15 then
    // probes Y+4 and uses facing-dependent X extents around that object.
    const actionObjectX = bart.facing === 0 ? bart.x + 0x10 : bart.x - 0x1e;
    inv.actionHitbox = bart.facing === 0
      ? { active: true, left: actionObjectX + 2, right: actionObjectX + 0x14, y: bart.y + 0x0e }
      : { active: true, left: actionObjectX + 6, right: actionObjectX + 0x1a, y: bart.y + 0x0e };

    // DOS DS:0EB7 also owns the visible spray sprite. +24 toggles 0/1;
    // every second active tick +26 XORs 000Ch. Facing-left adds 0018h,
    // yielding render offsets 00h/0Ch/18h/24h => descriptor frames 0..3.
    this.sprayVisualTimer = (this.sprayVisualTimer + 1) & 1;
    if (this.sprayVisualTimer === 0) this.sprayVisualFrame ^= 1;
    inv.actionVisual = {
      active: true,
      x: actionObjectX,
      y: bart.y + 0x0a,
      descriptorIndex: (bart.facing === 0 ? 0 : 2) + this.sprayVisualFrame,
    };

    inv.spraySubCounter0816 = (inv.spraySubCounter0816 - 1) & 7;
    if (inv.spraySubCounter0816 !== 0) return;
    this.collisionState.sprayMeter0815--;
    if (this.collisionState.sprayMeter0815 >= 0) return;
    if (!this.consumeItem(3)) return;
    if (this.itemCountNumber(3) > 0) this.collisionState.sprayMeter0815 = 0x1b;
    else {
      inv.actionActive = false;
      inv.actionHitbox = null;
      inv.actionVisual = null;
    }
  }

  private fireMeterWeapon(kind: "slingshot" | "dart"): void {
    const inv = this.state;
    if (inv.projectile?.active || this.previousAction) return;
    const bart = this.player.state;
    const facing = bart.facing === 0 ? 1 : -1;
    const item = kind === "slingshot" ? 10 : 11;
    const typeOffset = kind === "slingshot" ? 0x000e : 0x0008;
    const meterKey = kind === "slingshot" ? "level3Meter0782" : "level4Meter0781";
    const x = bart.x + (bart.facing === 0 ? 8 : 0);
    const projectile = createProjectile(kind, typeOffset, x, bart.y + 15, facing * 0x0400, 0, 0, 80);
    inv.projectile = projectile;
    this.spawnTransient(projectile, false);

    this.collisionState[meterKey]--;
    if (this.collisionState[meterKey] <= 0) {
      if (this.consumeItem(item) && this.itemCountNumber(item) > 0) this.collisionState[meterKey] = 0x0c;
    }
    this.note(`${kind.toUpperCase()} projectile fired`);
  }

  private stepLatchedItemAction(): void {
    const inv = this.state;
    if (inv.bartActionState === 2 && !inv.projectile?.active) {
      const f = this.player.state.facing === 0 ? 1 : -1;
      const p = createProjectile("cherry-bomb", 0x0002, this.player.state.x + f * 8, this.player.state.y + 12, f * 0x0180, -0x0200, 0x0040, 100);
      inv.projectile = p;
      this.spawnTransient(p, false);
      inv.bartActionState = 0x8002;
    } else if (inv.bartActionState === 4 && !inv.projectile?.active && !this.player.state.airborne) {
      // DOS State04 (7023h): this is NOT a horizontally flying projectile.
      // InitializeTransientGraphicObject clears all motion fields; the object
      // stays at Bart +/-10h, Y+10h and its common-overlay graphic animates.
      const right = this.player.state.facing === 0;
      const p = createProjectile("rocket", 0x0004, this.player.state.x + (right ? 0x10 : -0x10), this.player.state.y + 0x10, 0, 0, 0, 48);
      // The four unreferenced Level-1 object frames 4..7 are the decoded
      // common rocket artwork: two frames for each facing direction.
      p.descriptorIndex = right ? 4 : 6;
      p.alternateDescriptorIndex = right ? 5 : 7;
      p.animationPeriod = 4;
      inv.projectile = p;
      this.spawnTransient(p, false);
      inv.bartActionState = 0x8004;
    } else if ((inv.bartActionState & 0x8000) !== 0 && !inv.projectile?.active) {
      inv.bartActionState = 0;
    }
  }

  private stepProjectiles(): void {
    const inv = this.state;
    for (const p of inv.transientObjects) {
      if (!p.active) continue;
      p.velocityY = s16(p.velocityY + p.accelerationY);
      p.x += s16(p.velocityX) >> 8;
      p.y += s16(p.velocityY) >> 8;
      p.lifetime--;
      if (p.lifetime <= 0 || p.x < -64 || p.x > this.level.playerConfig.bart_max_x + 64 || p.y > 220 || p.y < -80) p.active = false;
    }
    inv.transientObjects = inv.transientObjects.filter((p) => p.active);
    if (inv.projectile && !inv.projectile.active) inv.projectile = null;
  }

  private spawnTransient(projectile: InventoryProjectileRuntime, append = true): void {
    if (append || !this.state.transientObjects.includes(projectile)) this.state.transientObjects.push(projectile);
  }

  private consumeItem(item: number): boolean {
    if (this.itemCountNumber(item) <= 0) return false;
    this.counts[item] = decrementBcd(this.counts[item] ?? 0);
    if (this.itemCountNumber(item) === 0 && this.state.selectedItem === item) this.state.selectedItem = 1;
    return true;
  }

  private resetSelection(message: string): void {
    this.state.selectedItem = 1;
    this.note(message);
  }

  private note(message: string): void {
    this.state.lastAction = message;
    this.effects.setHudEvent(message);
  }
}
