import type { BartRuntime, GameObjectRuntime } from "../game/types.js";
import type { RuntimeWorld } from "../game/RuntimeWorld.js";
import { applyXrayPalette, createXrayPalette } from "../game/XrayPalette.js";
import { LEVEL1_DEBUG_PRESETS } from "./Level1DebugTools.js";

/** Browser-only controls/inspection. The engine has no dependency on this UI. */
export class DebugWorkbench {
  private readonly rows: { button: HTMLButtonElement; info: HTMLElement }[] = [];
  private readonly buttons: HTMLButtonElement[] = [];
  private paletteWorld: RuntimeWorld | null = null;
  private palette = new Map<number, number[]>();

  constructor(
    cheats: HTMLElement,
    private readonly slots: HTMLElement,
    private readonly preview: HTMLCanvasElement,
    private readonly caption: HTMLElement,
    selectSlot: (slot: number) => void,
    runPreset: (id: string) => void,
  ) {
    for (const preset of LEVEL1_DEBUG_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "preset-button";
      const title = document.createElement("strong");
      title.textContent = preset.label;
      const hint = document.createElement("small");
      hint.textContent = preset.description;
      button.append(title, hint);
      button.addEventListener("click", () => runPreset(preset.id));
      cheats.append(button);
      this.buttons.push(button);
    }
    for (let slot = 0; slot < 28; slot++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "slot-row";
      const number = document.createElement("strong");
      number.textContent = String(slot).padStart(2, "0");
      const info = document.createElement("span");
      button.append(number, info);
      button.addEventListener("click", () => selectSlot(slot));
      slots.append(button);
      this.rows.push({ button, info });
    }
  }

  refresh(world: RuntimeWorld | null, selectedSlot: number | null, bartSelected: boolean): void {
    for (const button of this.buttons) button.disabled = !world || world.level.level !== 1;
    let active = 0;
    for (let i = 0; i < this.rows.length; i++) {
      const { button, info } = this.rows[i]!;
      const object = world?.getObjectBySlot(i);
      const occupied = !!object?.active;
      if (occupied) active++;
      button.classList.toggle("occupied", occupied);
      button.classList.toggle("selected", selectedSlot === i && !bartSelected);
      button.classList.toggle("blocked-slot", occupied && object?.vmState === "blocked");
      button.setAttribute("aria-pressed", String(selectedSlot === i && !bartSelected));
      button.disabled = !world;
      info.textContent = occupied && object
        ? `T${object.typeId} · ${object.sourceAttached ? "#" + object.source.index : "child"} · D${object.descriptorIndex ?? "—"} · ${object.vmState === "blocked" ? "BLOCKED" : object.vmWait ? "wait" : object.vmState} · (${object.x}, ${object.y})`
        : "Free";
    }
    this.slots.setAttribute("aria-label", `${active} of 28 object slots occupied`);
    const count = document.getElementById("slot-count");
    if (count) count.textContent = `${active} / 28 loaded`;
    const reserved = document.getElementById("reserved-slot");
    const projectile = world?.collisionState.inventory.projectile;
    if (reserved) reserved.textContent = projectile?.active
      ? `Separate action slot: ${projectile.kind} · D${projectile.descriptorIndex ?? "—"} · (${projectile.x}, ${projectile.y})`
      : "Separate action slot: free";
    this.drawPreview(world, bartSelected ? world?.bart ?? null : selectedSlot === null ? null : world?.getObjectBySlot(selectedSlot) ?? null);
  }

  private drawPreview(world: RuntimeWorld | null, subject: GameObjectRuntime | BartRuntime | null): void {
    const ctx = this.preview.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, this.preview.width, this.preview.height);
    if (!subject || ("active" in subject && !subject.active)) {
      this.caption.textContent = subject ? "Free slot — waiting for an object." : "Select Bart or an object slot.";
      return;
    }
    const image = subject.image;
    const object = "slotIndex" in subject ? subject : null;
    this.caption.textContent = object
      ? `Slot ${object.slotIndex} · ${object.descriptorBank ?? "no"} bank · D${object.descriptorIndex ?? "—"} · frame ${object.animFrame}/${object.animFrameCount} · timer ${object.animTimer}`
      : `Bart · D${(subject as BartRuntime).spriteDescriptorId} · frame ${(subject as BartRuntime).animationFrame}`;
    if (!image) {
      ctx.fillStyle = "#a9b4c4";
      ctx.font = "14px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No drawable frame (controller / missing asset)", this.preview.width / 2, this.preview.height / 2);
      return;
    }
    const scale = Math.max(1, Math.min(4, Math.floor(Math.min((this.preview.width - 16) / image.width, (this.preview.height - 16) / image.height))));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, Math.floor((this.preview.width - image.width * scale) / 2), Math.floor((this.preview.height - image.height * scale) / 2), image.width * scale, image.height * scale);
    if (world?.collisionState.inventory.alternateGraphicsTimer) {
      if (this.paletteWorld !== world) {
        this.paletteWorld = world;
        this.palette = createXrayPalette(world.level.manifest.runtime);
      }
      const pixels = ctx.getImageData(0, 0, this.preview.width, this.preview.height);
      applyXrayPalette(pixels.data, this.palette);
      ctx.putImageData(pixels, 0, 0);
    }
  }
}
