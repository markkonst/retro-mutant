import { INVENTORY_ITEMS } from "../../InventorySystem.js";
import type { BartInputState } from "../../types.js";
import type { LevelInteractionOverlay, LevelRuntimeServices } from "../LevelHandlers.js";

interface ShopRecord {
  /** DS:14E2/14FE/151A +00: exact BartX>>4 trigger key. */
  xCell: number;
  /** Original primary transient graphic offset (+02), retained for inspection/docs. */
  primaryGraphicOffset: number;
  /** Original primary post-selection graphic offset (+06). */
  activatedGraphicOffset: number;
  /** Primary object anchor (+0A/+0C). */
  primaryX: number;
  primaryY: number;
  /** The three selection/effect transient X anchors (+0E/+10/+12). */
  effectX: readonly [number, number, number];
  /** Inventory item ids at +14/+16. */
  items: readonly [number, number];
  /** Initial binary shop stock at +18/+1A. */
  initialStock: readonly [number, number];
}

/**
 * Recovered DS:14E2..1535 Level-1 storefront records.
 *
 * These are the runtime-data bytes at DS offsets 14E2h, 14FEh and 151Ah
 * (linear image 95D2h, 95EEh, 960Ah), not the unrelated CS bytes with the
 * same numeric offsets. State08 uses +14/+16 as inventory ids and +18/+1A
 * as binary stock words.
 */
const SHOP_RECORDS: readonly ShopRecord[] = [
  {
    xCell: 0x006e,
    primaryGraphicOffset: 0x30a6,
    activatedGraphicOffset: 0x30be,
    primaryX: 0x06e0,
    primaryY: 0x0060,
    effectX: [0x0730, 0x0760, 0x0740],
    items: [12, 6], // KEY / WRENCH
    initialStock: [1, 1],
  },
  {
    xCell: 0x007d,
    primaryGraphicOffset: 0x307a,
    activatedGraphicOffset: 0x3092,
    primaryX: 0x07d0,
    primaryY: 0x0058,
    effectX: [0x0830, 0x0860, 0x0840],
    items: [4, 5], // CHERRY BOMB / ROCKET
    initialStock: [0x99, 0x99],
  },
  {
    xCell: 0x008e,
    primaryGraphicOffset: 0x307a,
    activatedGraphicOffset: 0x3092,
    primaryX: 0x08e0,
    primaryY: 0x0058,
    effectX: [0x0930, 0x0960, 0x0940],
    items: [8, 7], // WHISTLE / MAGNET
    initialStock: [1, 1],
  },
] as const;

function bcdToNumber(value: number): number {
  const b = value & 0xff;
  return ((b >>> 4) & 0x0f) * 10 + (b & 0x0f);
}

function numberToBcd(value: number): number {
  const n = Math.max(0, Math.min(99, Math.trunc(value)));
  return (((Math.trunc(n / 10) & 0x0f) << 4) | (n % 10)) & 0xff;
}

/**
 * Level1SpecialSequence (4C09h), specifically the storefront/shop flow
 * entered by LevelSpecificPlayer_Level1 at 39AAh..3A04h.
 *
 * state is the even DS:07F1 byte-offset state: 00/02/04/.../10.
 * timer mirrors DS:07F2, fireLatch mirrors DS:07F7 and selection DS:07F9.
 */
export class Level1ShopHandlers {
  private state = 0;
  private timer = 0;
  private fireLatch = false;
  private selection = 0;
  private activeShop = -1;
  private primaryRuntimeId: number | null = null;
  private effectRuntimeIds: [number | null, number | null, number | null] = [null, null, null];
  private stock: [number, number][] = SHOP_RECORDS.map((r) => [...r.initialStock] as [number, number]);

  constructor(private readonly services: LevelRuntimeServices) {}

  reset(): void {
    this.services.clearTransientGraphic(this.primaryRuntimeId);
    for (const id of this.effectRuntimeIds) this.services.clearTransientGraphic(id);
    this.state = 0;
    this.timer = 0;
    this.fireLatch = false;
    this.selection = 0;
    this.activeShop = -1;
    this.primaryRuntimeId = null;
    this.effectRuntimeIds = [null, null, null];
    this.stock = SHOP_RECORDS.map((r) => [...r.initialStock] as [number, number]);
  }

  get active(): boolean { return this.state !== 0; }

  /** 39AAh..3A04h: exact Level-1 Up/storefront trigger. */
  tryEnter(input: BartInputState): boolean {
    if (this.active) return true;
    const bart = this.services.bart;
    if (bart.x < 0x0600 || bart.x >= 0x0900) return false;
    if (!input.jump || bart.velocityX !== 0 || bart.y !== 0x007a) return false;

    const xCell = (bart.x >>> 4) & 0xffff;
    const index = SHOP_RECORDS.findIndex((record) => record.xCell === xCell);
    if (index < 0) return false;

    this.activeShop = index;
    this.state = 0x02;
    this.timer = 0;
    this.fireLatch = false; // DS:07F7=0000h
    this.selection = 0;     // DS:07F9=0000h
    this.services.hud.lastEvent = `Entered ${this.shopName(index)}`;
    return true;
  }

  /** One 4C09h dispatcher tick. Returns true while Level-1 owns Bart update. */
  step(input: BartInputState): boolean {
    if (!this.active) return false;

    switch (this.state) {
      case 0x02: {
        // 4C2Ah: primary AllocateTransientGraphicObject(record+02,+0A,+0C).
        const record = SHOP_RECORDS[this.activeShop]!;
        this.primaryRuntimeId = this.services.allocateTransientGraphic(record.primaryX, record.primaryY, record.primaryGraphicOffset);
        this.state = 0x04;
        this.timer = 0x0f;
        break;
      }
      case 0x04:
      case 0x0e:
        this.timer = (this.timer - 1) & 0xff;
        if (this.timer === 0) this.state += 2;
        break;
      case 0x06: {
        // 4C4Eh: DOS deliberately forces one-frame invulnerability/blink and
        // allocates three fixed common-overlay graphic records.
        this.services.bart.blinkPhase = 4;
        this.services.bart.invulnerabilityTimer = 1;
        const record = SHOP_RECORDS[this.activeShop]!;
        this.effectRuntimeIds = [
          this.services.allocateTransientGraphic(record.effectX[0], 0x66, 0x3056),
          this.services.allocateTransientGraphic(record.effectX[1], 0x63, 0x3062),
          this.services.allocateTransientGraphic(record.effectX[2], 0x4f, 0x306e),
        ];
        this.state = 0x08;
        break;
      }
      case 0x08:
        this.services.bart.blinkPhase = 4;
        this.services.bart.invulnerabilityTimer = 1;
        this.stepSelection(input);
        break;
      case 0x0a:
        // 4CA7h: clear the three transient effect slots.
        for (const id of this.effectRuntimeIds) this.services.clearTransientGraphic(id);
        this.effectRuntimeIds = [null, null, null];
        this.state = 0x0c;
        break;
      case 0x0c:
        // 4CC5h: repoint primary object's +08 graphic pointer and clear +10.
        this.services.setTransientGraphicOffset(this.primaryRuntimeId, SHOP_RECORDS[this.activeShop]!.activatedGraphicOffset);
        this.state = 0x0e;
        this.timer = 0x0a;
        break;
      case 0x10:
        // 4DB7h: clear primary runtime slot and release g_HudPopupActive.
        this.services.clearTransientGraphic(this.primaryRuntimeId);
        this.primaryRuntimeId = null;
        this.state = 0;
        this.timer = 0;
        this.fireLatch = false;
        this.selection = 0;
        this.activeShop = -1;
        this.services.hud.lastEvent = "Left Level-1 shop";
        break;
      default:
        this.state = 0;
        this.activeShop = -1;
        break;
    }
    return this.active;
  }

  getOverlay(): LevelInteractionOverlay | null {
    if (!this.active || this.activeShop < 0) return null;
    const record = SHOP_RECORDS[this.activeShop]!;
    const stock = this.stock[this.activeShop]!;
    return {
      kind: "shop",
      title: this.shopName(this.activeShop),
      state: this.state,
      timer: this.timer,
      selectedIndex: this.selection,
      currencyLabel: "COINS",
      currency: bcdToNumber(this.services.collisionState.inventoryCounts[2] ?? 0),
      options: record.items.map((itemId, index) => ({
        itemId,
        label: INVENTORY_ITEMS[itemId]?.name ?? `ITEM ${itemId}`,
        stock: stock[index] ?? 0,
      })),
    };
  }

  private stepSelection(input: BartInputState): void {
    // State08: A/down exits immediately.
    if (input.down) {
      this.state = 0x0a;
      return;
    }

    // O/left and P/right select one of the two record entries. Repeated held
    // input naturally becomes a no-op once the corresponding edge is reached.
    if (input.left) {
      if (this.selection !== 0) this.selection = 0;
      return;
    }
    if (input.right) {
      if (this.selection === 0) this.selection = 1;
      return;
    }

    const fire = !!input.action;
    if (this.fireLatch) {
      if (!fire) this.fireLatch = false;
      return;
    }
    if (!fire) return;

    this.fireLatch = true;
    this.tryPurchase();
  }

  private tryPurchase(): void {
    if (this.activeShop < 0) return;
    const record = SHOP_RECORDS[this.activeShop]!;
    const stock = this.stock[this.activeShop]!;
    const itemId = record.items[this.selection]!;
    if ((stock[this.selection] ?? 0) === 0) {
      this.services.hud.lastEvent = `${INVENTORY_ITEMS[itemId]?.name ?? "ITEM"}: sold out`;
      return;
    }

    const counts = this.services.collisionState.inventoryCounts;
    const coins = bcdToNumber(counts[2] ?? 0);
    if (coins <= 0) {
      this.services.hud.lastEvent = "Not enough COINS";
      return;
    }

    counts[2] = numberToBcd(coins - 1);
    stock[this.selection] = Math.max(0, (stock[this.selection] ?? 0) - 1);
    counts[itemId] = numberToBcd(bcdToNumber(counts[itemId] ?? 0) + 1);
    this.services.hud.lastEvent = `Bought ${INVENTORY_ITEMS[itemId]?.name ?? `ITEM ${itemId}`}`;
  }

  private shopName(index: number): string {
    return index === 0 ? "SHOP 1: KEY / WRENCH"
      : index === 1 ? "SHOP 2: CHERRY BOMB / ROCKET"
      : "SHOP 3: WHISTLE / MAGNET";
  }
}
