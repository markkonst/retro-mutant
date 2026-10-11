import { glyphRows } from "./DosFont.js";
import { INVENTORY_ITEMS } from "./InventorySystem.js";
import { RuntimeWorld } from "./RuntimeWorld.js";
import { LoadedLevel } from "./types.js";

const SCREEN_W = 320;
const HUD_Y = 160;
const HUD_H = 40;

function bcdToNumber(value: number): number {
  const b = value & 0xff;
  return ((b >>> 4) & 0x0f) * 10 + (b & 0x0f);
}

export class DosHudRenderer {
  draw(ctx: CanvasRenderingContext2D, world: RuntimeWorld, level: LoadedLevel, zoom: number): void {
    const black = this.palette(level, 0, "#000000");
    const white = this.palette(level, 1, "#e7e7e7");
    const blue = this.palette(level, 5, "#45aefb");
    const yellow = this.palette(level, 12, "#f3e300");

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    this.fill(ctx, 0, HUD_Y, SCREEN_W, HUD_H, zoom, black);

    // Reconstructed fixed DOS layout: the original driver initializes a fixed
    // frame first, then overlays inventory, score/lives/time/goals and the
    // per-level meter. Coordinates are intentionally kept in logical 320x200.
    this.box(ctx, 0, HUD_Y, 50, HUD_H, zoom, blue);
    this.box(ctx, 52, HUD_Y, 168, 14, zoom, blue);
    this.box(ctx, 222, HUD_Y, 46, 14, zoom, blue);
    this.box(ctx, 52, HUD_Y + 16, 72, 23, zoom, blue);
    this.box(ctx, 126, HUD_Y + 16, 42, 23, zoom, blue);
    this.box(ctx, 170, HUD_Y + 16, 50, 23, zoom, blue);
    this.box(ctx, 222, HUD_Y + 16, 46, 23, zoom, blue);
    this.box(ctx, 270, HUD_Y, 50, HUD_H, zoom, blue);

    this.drawBartPortrait(ctx, world, zoom);

    const inv = world.collisionState.inventory;
    const selected = INVENTORY_ITEMS[inv.selectedItem] ?? INVENTORY_ITEMS[1]!;
    this.text(ctx, selected.name, 56, HUD_Y + 3, zoom, white);
    this.drawInventoryIcon(ctx, selected.id, 226, HUD_Y + 3, zoom, selected.name, yellow, white);

    this.field(ctx, "SCORE", String(world.hud.score).padStart(6, "0"), 56, HUD_Y + 18, zoom, white);
    this.field(ctx, "LIVES", String(world.hud.livesRemaining), 130, HUD_Y + 18, zoom, white);
    this.field(ctx, "TIME", String(world.hud.levelTimer).padStart(3, "0"), 174, HUD_Y + 18, zoom, white);
    this.field(ctx, "GOALS", String(world.hud.goalsRemaining).padStart(2, "0"), 226, HUD_Y + 18, zoom, white);

    this.drawLevelMeter(ctx, world, level, zoom, white, blue, yellow);

    if (inv.alternateGraphicsTimer !== 0) this.text(ctx, "XRAY", 274, HUD_Y + 29, zoom, yellow, 1);
    const interaction = world.getLevelInteractionOverlay();
    if (interaction?.kind === "shop") this.drawShopPopup(ctx, interaction, zoom, black, blue, white, yellow);
    else if (inv.modeHeld) this.drawInventoryPopup(ctx, world, zoom, black, blue, white, yellow);
    ctx.restore();
  }

  private drawBartPortrait(ctx: CanvasRenderingContext2D, world: RuntimeWorld, zoom: number): void {
    const image = world.bart.image;
    if (!image) return;
    const maxW = 42;
    const maxH = 35;
    const scale = Math.min(maxW / image.width, maxH / image.height);
    const w = Math.max(1, Math.floor(image.width * scale));
    const h = Math.max(1, Math.floor(image.height * scale));
    ctx.drawImage(image, 4 * zoom, (HUD_Y + 2) * zoom, w * zoom, h * zoom);
  }

  private field(ctx: CanvasRenderingContext2D, label: string, value: string, x: number, y: number, zoom: number, color: string): void {
    this.text(ctx, label, x, y, zoom, color, 1);
    this.text(ctx, value, x, y + 9, zoom, color, 1);
  }

  private drawLevelMeter(ctx: CanvasRenderingContext2D, world: RuntimeWorld, level: LoadedLevel, zoom: number, white: string, blue: string, yellow: string): void {
    const state = world.collisionState;
    this.text(ctx, `L${level.level}`, 274, HUD_Y + 3, zoom, white);

    let value = 0;
    let max = 6;
    const levelMeter = world.getLevelHudMeter();
    if (levelMeter) {
      value = levelMeter.value;
      max = levelMeter.max;
      this.text(ctx, levelMeter.label, 274, HUD_Y + 12, zoom, white, 1);
    } else if (level.level === 3) {
      value = Math.max(0, Math.min(12, state.level3Meter0782));
      max = 12;
      this.text(ctx, "SLG", 274, HUD_Y + 12, zoom, white, 1);
    } else if (level.level === 4) {
      value = Math.max(0, Math.min(12, state.level4Meter0781));
      max = 12;
      this.text(ctx, "DART", 274, HUD_Y + 12, zoom, white, 1);
    } else if (level.level === 5) {
      value = Math.max(0, Math.min(4, state.specialCounter0780));
      max = 4;
      this.text(ctx, "CELL", 274, HUD_Y + 12, zoom, white, 1);
    } else {
      this.text(ctx, "---", 274, HUD_Y + 12, zoom, white, 1);
    }

    const pips = 6;
    const filled = max <= 0 ? 0 : Math.ceil((value / max) * pips);
    for (let i = 0; i < pips; i++) {
      const x = 274 + i * 7;
      this.box(ctx, x, HUD_Y + 22, 5, 5, zoom, blue);
      if (i < filled) this.fill(ctx, x + 1, HUD_Y + 23, 3, 3, zoom, yellow);
    }
  }

  private drawInventoryPopup(ctx: CanvasRenderingContext2D, world: RuntimeWorld, zoom: number, black: string, blue: string, white: string, yellow: string): void {
    const inv = world.collisionState.inventory;
    const item = INVENTORY_ITEMS[inv.selectedItem] ?? INVENTORY_ITEMS[1]!;
    const count = inv.selectedItem <= 1 ? "--" : String(bcdToNumber(world.collisionState.inventoryCounts[inv.selectedItem] ?? 0)).padStart(2, "0");
    this.fill(ctx, 38, 52, 244, 62, zoom, black);
    this.box(ctx, 38, 52, 244, 62, zoom, blue);
    this.box(ctx, 46, 62, 42, 42, zoom, blue);
    this.drawInventoryIcon(ctx, item.id, 55, 72, zoom, item.name, yellow, white, 2);
    this.text(ctx, "INVENTORY", 98, 60, zoom, blue);
    this.text(ctx, item.name, 98, 75, zoom, white);
    this.text(ctx, `COUNT ${count}`, 98, 88, zoom, yellow);
    this.text(ctx, "SPACE:CYCLE  RELEASE A:USE", 50, 104, zoom, white, 1);
  }

  private drawShopPopup(ctx: CanvasRenderingContext2D, overlay: import("./levels/LevelHandlers.js").LevelInteractionOverlay, zoom: number, black: string, blue: string, white: string, yellow: string): void {
    this.fill(ctx, 26, 38, 268, 94, zoom, black);
    this.box(ctx, 26, 38, 268, 94, zoom, blue);
    this.text(ctx, "SHOP", 38, 47, zoom, blue);
    this.text(ctx, `${overlay.currencyLabel} ${String(overlay.currency).padStart(2, "0")}`, 190, 47, zoom, yellow);

    overlay.options.forEach((option, index) => {
      const y = 68 + index * 22;
      this.text(ctx, index === overlay.selectedIndex ? ">" : " ", 38, y, zoom, yellow);
      this.text(ctx, option.label, 54, y, zoom, index === overlay.selectedIndex ? yellow : white);
      this.text(ctx, `STOCK ${String(option.stock).padStart(2, "0")}`, 182, y, zoom, white);
    });

    this.text(ctx, "O/P SELECT SPACE BUY A EXIT", 38, 116, zoom, white);
  }

  /**
   * The original metadata offsets are preserved in InventorySystem. The
   * common GENERAL.OVL offscreen-sheet blitter is not yet a standalone asset
   * decoder, so this draws compact pixel symbols while keeping DOS names,
   * counters, layout and font exact/recovered.
   */
  private drawInventoryIcon(ctx: CanvasRenderingContext2D, id: number, x: number, y: number, zoom: number, name: string, primary: string, secondary: string, scale = 1): void {
    const abbrev = id === 1 ? "XR" : id === 3 ? "SP" : id === 10 ? "SL" : id === 11 ? "DG" : name.slice(0, 2);
    this.text(ctx, abbrev, x, y, zoom, primary, scale);
    if (id === 2) this.box(ctx, x + 17, y, 7, 7, zoom, secondary);
  }

  private text(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, zoom: number, color: string, glyphScale = 1): void {
    let cursor = x;
    for (const ch of text.toUpperCase()) {
      this.glyph(ctx, ch.charCodeAt(0), cursor, y, zoom, color, glyphScale);
      cursor += 8 * glyphScale;
    }
  }

  private glyph(ctx: CanvasRenderingContext2D, code: number, x: number, y: number, zoom: number, color: string, glyphScale: number): void {
    const rows = glyphRows(code);
    ctx.fillStyle = color;
    const px = zoom * glyphScale;
    for (let row = 0; row < 8; row++) {
      const bits = rows[row] ?? 0;
      for (let col = 0; col < 8; col++) {
        if ((bits & (0x80 >>> col)) === 0) continue;
        ctx.fillRect((x + col * glyphScale) * zoom, (y + row * glyphScale) * zoom, px, px);
      }
    }
  }

  private box(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, zoom: number, color: string): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1, zoom);
    ctx.strokeRect(x * zoom + 0.5, y * zoom + 0.5, w * zoom - 1, h * zoom - 1);
  }

  private fill(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, zoom: number, color: string): void {
    ctx.fillStyle = color;
    ctx.fillRect(x * zoom, y * zoom, w * zoom, h * zoom);
  }

  private palette(level: LoadedLevel, index: number, fallback: string): string {
    const rgb6 = level.manifest.runtime.palette_A?.rgb6?.[index];
    if (!rgb6 || rgb6.length < 3) return fallback;
    const [r, g, b] = rgb6.map((v) => Math.round((v * 255) / 63));
    return `rgb(${r},${g},${b})`;
  }
}
