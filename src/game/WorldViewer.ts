import { RuntimeWorld } from "./RuntimeWorld.js";
import { DosHudRenderer } from "./DosHudRenderer.js";
import { glyphRows } from "./DosFont.js";
import { BartRuntime, GameObjectRuntime, LoadedLevel } from "./types.js";

export interface ViewerOptions {
  zoom: number;
  showSourceAnchors: boolean;
  showLabels: boolean;
  showCollision: boolean;
  showTerrain: boolean;
  showInvisibleControllers: boolean;
  showBlockedVm: boolean;
}

export interface ViewerSelectionEvent {
  object: GameObjectRuntime | null;
  bart: BartRuntime | null;
}

type SelectionListener = (event: ViewerSelectionEvent) => void;
type CameraListener = (cameraX: number) => void;

interface ScreenRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export class WorldViewer {
  private readonly backgroundRemapCache = new Map<string, HTMLCanvasElement>();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly dosHud = new DosHudRenderer();
  private level: LoadedLevel | null = null;
  private world: RuntimeWorld | null = null;
  private cameraX = 0;
  private options: ViewerOptions = {
    zoom: 3,
    showSourceAnchors: true,
    showLabels: false,
    showCollision: false,
    showTerrain: false,
    showInvisibleControllers: true,
    showBlockedVm: true,
  };
  private selectedSourceIndex: number | null = null;
  private selectedBart = false;
  private selectionListener: SelectionListener | null = null;
  private cameraListener: CameraListener | null = null;
  private readonly resizeObserver: ResizeObserver;
  private dragging = false;
  private dragMoved = false;
  private dragStartClientX = 0;
  private dragStartCameraX = 0;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D is unavailable.");
    this.ctx = context;
    this.ctx.imageSmoothingEnabled = false;

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas());
    this.resizeObserver.observe(canvas.parentElement ?? canvas);
    this.installPointerHandlers();
    this.resizeCanvas();
  }

  setSelectionListener(listener: SelectionListener): void {
    this.selectionListener = listener;
  }

  setCameraListener(listener: CameraListener): void {
    this.cameraListener = listener;
  }

  setWorld(level: LoadedLevel, world: RuntimeWorld): void {
    this.level = level;
    this.world = world;
    this.selectedSourceIndex = null;
    this.selectedBart = false;
    this.backgroundRemapCache.clear();
    // Initialize like the recovered gameplay setup: startX - 0x88, clamped.
    this.cameraX = world.bart.x - 0x88;
    this.clampCamera();
    this.render();
    this.selectionListener?.({ object: null, bart: null });
  }

  refreshSelection(): void {
    if (this.selectedBart) {
      this.selectionListener?.({ object: null, bart: this.world?.bart ?? null });
      return;
    }
    if (this.selectedSourceIndex === null) return;
    this.selectionListener?.({ object: this.world?.getObjectBySourceIndex(this.selectedSourceIndex) ?? null, bart: null });
  }

  setCameraX(value: number): void {
    this.cameraX = value;
    this.clampCamera();
    this.render();
    this.cameraListener?.(this.cameraX);
  }

  followBartDeadZone(): void {
    const world = this.world;
    if (!world) return;

    // Recovered normal camera window uses camera+0x34 and camera+0xFC.
    const viewport = this.getViewportWorldWidth();
    const leftEdge = Math.min(0x34, Math.max(0, viewport * 0.25));
    const rightEdge = Math.min(0xfc, Math.max(leftEdge + 1, viewport - 0x44));
    const screenWorldX = world.bart.x - this.cameraX;

    if (screenWorldX < leftEdge) {
      this.cameraX = world.bart.x - leftEdge;
      this.clampCamera();
      this.cameraListener?.(this.cameraX);
    } else if (screenWorldX > rightEdge) {
      this.cameraX = world.bart.x - rightEdge;
      this.clampCamera();
      this.cameraListener?.(this.cameraX);
    }
  }

  getCameraX(): number {
    return this.cameraX;
  }

  getWorldWidth(): number {
    return this.level?.manifest.map.world_width_pixels ?? 0;
  }

  getViewportWorldWidth(): number {
    return this.canvas.clientWidth / this.options.zoom;
  }

  setOptions(options: Partial<ViewerOptions>): void {
    const zoomChanged = options.zoom !== undefined && options.zoom !== this.options.zoom;
    this.options = { ...this.options, ...options };
    this.clampCamera();
    if (zoomChanged) this.resizeCanvas();
    else this.render();
    this.cameraListener?.(this.cameraX);
  }

  getOptions(): ViewerOptions {
    return { ...this.options };
  }

  panBy(worldPixels: number): void {
    this.setCameraX(this.cameraX + worldPixels);
  }

  jumpToEnd(): void {
    if (!this.level) return;
    this.setCameraX(this.level.manifest.map.world_width_pixels - this.getViewportWorldWidth());
  }

  selectSource(index: number | null): void {
    this.selectedBart = false;
    this.selectedSourceIndex = index;
    const object = index === null ? null : this.world?.getObjectBySourceIndex(index) ?? null;
    this.selectionListener?.({ object, bart: null });
    this.render();
  }

  selectBart(): void {
    this.selectedSourceIndex = null;
    this.selectedBart = true;
    this.selectionListener?.({ object: null, bart: this.world?.bart ?? null });
    this.render();
  }

  clearSelection(): void {
    this.selectedSourceIndex = null;
    this.selectedBart = false;
    this.selectionListener?.({ object: null, bart: null });
    this.render();
  }

  render(): void {
    const level = this.level;
    const world = this.world;
    const ctx = this.ctx;
    const dpr = window.devicePixelRatio || 1;
    const cssWidth = this.canvas.clientWidth;
    const cssHeight = this.canvas.clientHeight;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = "#101010";
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    if (!level || !world) return;

    const zoom = this.options.zoom;
    const gameplayHeight = 160;
    const visibleWorldWidth = 320;
    const sourceWidth = Math.min(visibleWorldWidth, level.background.width - this.cameraX);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, 320 * zoom, gameplayHeight * zoom);
    ctx.clip();

    if (sourceWidth > 0) {
      ctx.drawImage(
        level.background,
        Math.floor(this.cameraX), 0, Math.ceil(sourceWidth), gameplayHeight,
        0, 0, Math.ceil(sourceWidth * zoom), gameplayHeight * zoom,
      );
    }

    this.drawSpecialBackgroundRemaps(level, world, zoom);
    if (this.options.showTerrain) this.drawTerrain(level, zoom);

    for (const object of world.objects) {
      if (object.active) this.drawObject(object, zoom);
    }
    this.drawEventSpeech(world, zoom);

    // Bart is a separate player/render object in the original engine.
    this.drawBart(world.bart, zoom);
    this.drawInventoryTransients(world, zoom);
    ctx.restore();

    this.dosHud.draw(ctx, world, level, zoom);
    if (this.options.showLabels) this.drawViewportInfo(level, world);
  }

  private drawInventoryTransients(world: RuntimeWorld, zoom: number): void {
    const actionVisual = world.collisionState.inventory.actionVisual;
    if (actionVisual?.active) {
      const descriptor = world.level.descriptorByIndex.get(actionVisual.descriptorIndex) ?? null;
      const image = world.level.imageByDescriptorIndex.get(actionVisual.descriptorIndex) ?? null;
      if (descriptor && image) {
        const x = (actionVisual.x + descriptor.x_offset - this.cameraX) * zoom;
        const y = (actionVisual.y + descriptor.y_offset) * zoom;
        this.ctx.drawImage(image, x, y, image.width * zoom, image.height * zoom);
      }
    }

    for (const transient of world.collisionState.inventory.transientObjects) {
      if (!transient.active) continue;

      let descriptorIndex = transient.descriptorIndex;
      if (descriptorIndex !== undefined && transient.alternateDescriptorIndex !== undefined) {
        const period = Math.max(1, transient.animationPeriod ?? 4);
        if ((Math.floor(Math.max(0, transient.lifetime) / period) & 1) === 0) descriptorIndex = transient.alternateDescriptorIndex;
      }
      const descriptor = descriptorIndex === undefined ? null : world.level.descriptorByIndex.get(descriptorIndex) ?? null;
      const image = descriptorIndex === undefined ? null : world.level.imageByDescriptorIndex.get(descriptorIndex) ?? null;
      if (descriptor && image) {
        const x = (transient.x + descriptor.x_offset - this.cameraX) * zoom;
        const y = (transient.y + descriptor.y_offset) * zoom;
        this.ctx.drawImage(image, x, y, image.width * zoom, image.height * zoom);
        if (this.options.showLabels) this.drawTextLabel(transient.kind, x, y);
        continue;
      }

      const x = (transient.x - this.cameraX) * zoom;
      const y = transient.y * zoom;
      this.ctx.save();
      this.ctx.fillStyle = transient.kind === "cherry-bomb" ? "#ff55ff" : "#ffffff";
      this.ctx.fillRect(x, y, Math.max(2, 4 * zoom), Math.max(2, 4 * zoom));
      if (this.options.showLabels) this.drawTextLabel(transient.kind, x, y);
      this.ctx.restore();
    }

    const action = world.collisionState.inventory.actionHitbox;
    if (this.options.showCollision && action?.active) {
      this.ctx.save();
      this.ctx.strokeStyle = "#ff55ff";
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();
      this.ctx.moveTo((action.left - this.cameraX) * zoom, action.y * zoom + 0.5);
      this.ctx.lineTo((action.right - this.cameraX) * zoom, action.y * zoom + 0.5);
      this.ctx.stroke();
      this.ctx.restore();
    }
  }

  private drawBart(bart: BartRuntime, zoom: number): void {
    const descriptor = bart.descriptor;
    const image = bart.image;
    const worldX = descriptor ? bart.x + descriptor.x_offset : bart.x;
    const worldY = descriptor ? bart.y + descriptor.y_offset : bart.y;
    const width = descriptor?.width_pixels ?? 16;
    const height = descriptor?.height_pixels ?? 30;
    const viewLeft = this.cameraX;
    const viewRight = this.cameraX + this.getViewportWorldWidth();
    if (worldX + width < viewLeft || worldX > viewRight) return;

    const screenX = (worldX - this.cameraX) * zoom;
    const screenY = worldY * zoom;
    if (descriptor && image && bart.renderVisible) {
      this.ctx.drawImage(image, screenX, screenY, image.width * zoom, image.height * zoom);
    }

    if (this.options.showSourceAnchors) {
      const anchorX = (bart.x - this.cameraX) * zoom;
      const anchorY = bart.y * zoom;
      this.ctx.save();
      this.ctx.strokeStyle = this.selectedBart ? "#ffffff" : "#ffef73";
      this.ctx.lineWidth = this.selectedBart ? 2 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(anchorX - 5, anchorY);
      this.ctx.lineTo(anchorX + 5, anchorY);
      this.ctx.moveTo(anchorX, anchorY - 5);
      this.ctx.lineTo(anchorX, anchorY + 5);
      this.ctx.stroke();
      this.ctx.restore();
    }

    if (this.selectedBart && descriptor) {
      this.ctx.save();
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, width * zoom, height * zoom);
      this.ctx.restore();
    }

    if (this.options.showCollision) {
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 96, 96, 0.98)";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(
        (bart.x + 2 - this.cameraX) * zoom + 0.5,
        (bart.y + 4) * zoom + 0.5,
        12 * zoom,
        24 * zoom,
      );
      this.ctx.restore();
    }

    if (this.options.showLabels) {
      const visibility = bart.renderVisible ? "" : " HIDDEN";
      const text = `BART D${bart.spriteDescriptorId}${bart.airborne ? " AIR" : ""}${visibility}`;
      this.drawTextLabel(text, screenX, screenY);
    }
  }

  private drawSpecialBackgroundRemaps(level: LoadedLevel, world: RuntimeWorld, zoom: number): void {
    for (const object of world.objects) {
      if (!object.active || !object.specialRenderBytes) continue;
      const [a, b, c] = object.specialRenderBytes;
      // Level-1's recovered ExternalSpecial3Bytes states use 04 04 0D for
      // the untouched purple background art and 04 0A 06 for the altered
      // goal state. The DOS platform callback edits the background raster at
      // the current object anchor. Reproduce that as a local palette remap
      // rather than tinting an object sprite (T38/T73 have no sprite).
      if (level.level !== 1 || a !== 0x04 || b !== 0x0a || c !== 0x06) continue;
      this.drawLevel1RedBackgroundPatch(level, object, zoom);
    }
  }

  private drawLevel1RedBackgroundPatch(level: LoadedLevel, object: GameObjectRuntime, zoom: number): void {
    const left = Math.max(0, Math.trunc(object.x) - 48);
    const top = Math.max(0, Math.trunc(object.y) - 48);
    const width = Math.max(0, Math.min(96, level.background.width - left));
    const height = Math.max(0, Math.min(88, level.background.height - top));
    if (width === 0 || height === 0) return;

    const key = `${level.level}:${object.source.index}:${left}:${top}:${width}:${height}`;
    let patch = this.backgroundRemapCache.get(key);
    if (!patch) {
      patch = document.createElement("canvas");
      patch.width = width;
      patch.height = height;
      const ctx = patch.getContext("2d", { willReadFrequently: true })!;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(level.background, left, top, width, height, 0, 0, width, height);
      const pixels = ctx.getImageData(0, 0, width, height);
      const data = pixels.data;
      for (let i = 0; i < data.length; i += 4) {
        // Purple objective ink in the decoded DOS palette. Preserve every
        // non-target pixel so the overlay is safe over the baked background.
        if (data[i] === 255 && data[i + 1] === 142 && data[i + 2] === 255) {
          data[i] = 227; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
        } else {
          data[i + 3] = 0;
        }
      }
      ctx.clearRect(0, 0, width, height);
      ctx.putImageData(pixels, 0, 0);
      this.backgroundRemapCache.set(key, patch);
    }

    this.ctx.drawImage(patch, (left - this.cameraX) * zoom, top * zoom, width * zoom, height * zoom);
  }

  private drawObject(object: GameObjectRuntime, zoom: number): void {
    const descriptor = object.descriptor;
    const image = object.image;
    const worldX = descriptor ? object.x + descriptor.x_offset : object.x;
    const worldY = descriptor ? object.y + descriptor.y_offset : object.y;
    const width = descriptor?.width_pixels ?? 8;
    const height = descriptor?.height_pixels ?? 8;
    const viewLeft = this.cameraX;
    const viewRight = this.cameraX + this.getViewportWorldWidth();

    if (worldX + width < viewLeft || worldX > viewRight) return;

    const screenX = (worldX - this.cameraX) * zoom;
    const screenY = worldY * zoom;
    const selected = this.selectedSourceIndex === object.source.index;

    if (image) {
      this.ctx.drawImage(image, screenX, screenY, image.width * zoom, image.height * zoom);
    } else if (this.options.showInvisibleControllers) {
      this.drawControllerMarker((object.x - this.cameraX) * zoom, object.y * zoom, zoom, selected, object.vmState === "blocked");
    }

    if (this.options.showCollision && object.collision) {
      const collision = object.collision;
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 255, 0, 0.95)";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(
        (object.x + collision.x_offset - this.cameraX) * zoom + 0.5,
        (object.y + collision.y_offset) * zoom + 0.5,
        collision.width * zoom,
        collision.height * zoom,
      );
      this.ctx.restore();
    }

    if (this.options.showSourceAnchors) {
      const anchorX = (object.x - this.cameraX) * zoom;
      const anchorY = object.y * zoom;
      this.ctx.save();
      this.ctx.strokeStyle = selected ? "#ffffff" : "#00ffff";
      this.ctx.lineWidth = selected ? 2 : 1;
      this.ctx.beginPath();
      this.ctx.moveTo(anchorX - 4, anchorY);
      this.ctx.lineTo(anchorX + 4, anchorY);
      this.ctx.moveTo(anchorX, anchorY - 4);
      this.ctx.lineTo(anchorX, anchorY + 4);
      this.ctx.stroke();
      this.ctx.restore();
    }

    if (this.options.showBlockedVm && object.vmState === "blocked") {
      this.ctx.save();
      this.ctx.strokeStyle = "#ff9b42";
      this.ctx.lineWidth = selected ? 2 : 1;
      this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, Math.max(3, width * zoom), Math.max(3, height * zoom));
      this.ctx.restore();
    } else if (selected && descriptor) {
      this.ctx.save();
      this.ctx.strokeStyle = "#ffffff";
      this.ctx.lineWidth = 1;
      this.ctx.strokeRect(screenX + 0.5, screenY + 0.5, width * zoom, height * zoom);
      this.ctx.restore();
    }

    if (this.options.showLabels) this.drawLabel(object, screenX, screenY);
  }

  /** Reconstructed text layer for SetGlobalEventData + type13/14 speech-bubble children. */
  private drawEventSpeech(world: RuntimeWorld, zoom: number): void {
    for (const object of world.objects) {
      if (!object.active || !object.eventTextSnapshot?.length) continue;
      const lines = object.eventTextSnapshot.slice(0, 3);
      const maxChars = Math.max(...lines.map((line) => line.length), 1);
      const pixelWidth = Math.min(304, maxChars * 8 + 8);
      const pixelHeight = lines.length * 8 + 6;
      let px = object.x - this.cameraX - Math.floor(pixelWidth / 2);
      let py = object.y - pixelHeight - 8;
      px = Math.max(2, Math.min(318 - pixelWidth, px));
      py = Math.max(2, Math.min(158 - pixelHeight, py));
      this.ctx.save();
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(px * zoom, py * zoom, pixelWidth * zoom, pixelHeight * zoom);
      this.ctx.strokeStyle = "#000000";
      this.ctx.lineWidth = Math.max(1, zoom);
      this.ctx.strokeRect(px * zoom + 0.5, py * zoom + 0.5, pixelWidth * zoom - 1, pixelHeight * zoom - 1);
      for (let row = 0; row < lines.length; row++) this.drawDosText(lines[row]!, px + 4, py + 3 + row * 8, zoom);
      this.ctx.restore();
    }
  }

  private drawDosText(text: string, x: number, y: number, zoom: number): void {
    this.ctx.fillStyle = "#000000";
    let cursor = x;
    for (const ch of text.toUpperCase()) {
      const rows = glyphRows(ch.charCodeAt(0));
      for (let yy = 0; yy < 8; yy++) {
        const bits = rows[yy] ?? 0;
        for (let xx = 0; xx < 8; xx++) {
          if ((bits & (0x80 >>> xx)) !== 0) this.ctx.fillRect((cursor + xx) * zoom, (y + yy) * zoom, zoom, zoom);
        }
      }
      cursor += 8;
    }
  }

  private drawControllerMarker(x: number, y: number, zoom: number, selected: boolean, blocked: boolean): void {
    const size = Math.max(4, zoom * 2);
    this.ctx.save();
    this.ctx.fillStyle = selected ? "#ffffff" : blocked ? "#ff9b42" : "#ff40ff";
    this.ctx.fillRect(x - size / 2, y - size / 2, size, size);
    this.ctx.strokeStyle = "#000000";
    this.ctx.strokeRect(x - size / 2 + 0.5, y - size / 2 + 0.5, size - 1, size - 1);
    this.ctx.restore();
  }

  private drawLabel(object: GameObjectRuntime, x: number, y: number): void {
    this.drawTextLabel(`S${object.source.index} T${object.typeId} F${object.animFrame}`, x, y);
  }

  private drawTextLabel(text: string, x: number, y: number): void {
    this.ctx.save();
    this.ctx.font = "11px Consolas, monospace";
    this.ctx.textBaseline = "bottom";
    const metrics = this.ctx.measureText(text);
    this.ctx.fillStyle = "rgba(0,0,0,.75)";
    this.ctx.fillRect(x, y - 14, metrics.width + 4, 14);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText(text, x + 2, y - 1);
    this.ctx.restore();
  }

  private drawTerrain(level: LoadedLevel, zoom: number): void {
    this.ctx.save();
    this.ctx.lineWidth = 1;
    for (const terrain of level.runtime.static_terrain) {
      if (terrain.x2 < this.cameraX || terrain.x1 > this.cameraX + this.getViewportWorldWidth()) continue;
      this.ctx.strokeStyle = terrain.bounce ? "#ff55ff" : "#55ff55";
      this.ctx.beginPath();
      this.ctx.moveTo((terrain.x1 - this.cameraX) * zoom, terrain.surface_y * zoom + 0.5);
      this.ctx.lineTo((terrain.x2 - this.cameraX) * zoom, terrain.surface_y * zoom + 0.5);
      this.ctx.stroke();
    }
    this.ctx.restore();
  }

  private drawViewportInfo(level: LoadedLevel, world: RuntimeWorld): void {
    const stats = world.getStats();
    this.ctx.save();
    this.ctx.font = "12px Consolas, monospace";
    this.ctx.textBaseline = "top";
    const text = `L${level.level} tick=${stats.tick} cam=${Math.round(this.cameraX)} Bart=${world.bart.x},${world.bart.y} D${world.bart.spriteDescriptorId} support=${world.bart.supportKind} col=${stats.collisionEvents} active=${stats.activeObjects} blocked=${stats.blockedObjects}`;
    const width = this.ctx.measureText(text).width;
    this.ctx.fillStyle = "rgba(0,0,0,.72)";
    this.ctx.fillRect(6, 6, width + 10, 20);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillText(text, 11, 10);
    this.ctx.restore();
  }

  private resizeCanvas(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const width = 320 * this.options.zoom;
    const height = 200 * this.options.zoom;
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.canvas.width = Math.round(width * dpr);
    this.canvas.height = Math.round(height * dpr);
    this.clampCamera();
    this.render();
  }

  private clampCamera(): void {
    const worldWidth = this.level?.manifest.map.world_width_pixels ?? 0;
    const maxCamera = Math.max(0, worldWidth - this.getViewportWorldWidth());
    this.cameraX = Math.max(0, Math.min(maxCamera, this.cameraX));
  }

  private installPointerHandlers(): void {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.dragging = true;
      this.dragMoved = false;
      this.dragStartClientX = event.clientX;
      this.dragStartCameraX = this.cameraX;
      this.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging) return;
      const delta = event.clientX - this.dragStartClientX;
      if (Math.abs(delta) >= 3) this.dragMoved = true;
      this.setCameraX(this.dragStartCameraX - delta / this.options.zoom);
    });

    this.canvas.addEventListener("pointerup", (event) => {
      if (this.dragging && !this.dragMoved) this.selectAtClientPoint(event.clientX, event.clientY);
      this.dragging = false;
      this.canvas.releasePointerCapture(event.pointerId);
    });

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey) {
        const nextZoom = Math.max(1, Math.min(6, this.options.zoom + (event.deltaY < 0 ? 1 : -1)));
        this.setOptions({ zoom: nextZoom });
      } else {
        const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
        this.panBy(delta / this.options.zoom);
      }
    }, { passive: false });
  }

  private selectAtClientPoint(clientX: number, clientY: number): void {
    const world = this.world;
    if (!world) return;
    const rect = this.canvas.getBoundingClientRect();
    const screenX = clientX - rect.left;
    const screenY = clientY - rect.top;

    const bartRect = this.bartScreenRect(world.bart);
    if (screenX >= bartRect.left && screenX <= bartRect.right && screenY >= bartRect.top && screenY <= bartRect.bottom) {
      this.selectBart();
      return;
    }

    for (let i = world.objects.length - 1; i >= 0; --i) {
      const object = world.objects[i];
      if (!object?.active) continue;
      const hitRect = this.objectScreenRect(object);
      if (screenX >= hitRect.left && screenX <= hitRect.right && screenY >= hitRect.top && screenY <= hitRect.bottom) {
        this.selectSource(object.source.index);
        return;
      }
    }
    this.clearSelection();
  }

  private bartScreenRect(bart: BartRuntime): ScreenRect {
    const zoom = this.options.zoom;
    const descriptor = bart.descriptor;
    if (!descriptor) {
      const x = (bart.x - this.cameraX) * zoom;
      const y = bart.y * zoom;
      return { left: x - 6, top: y - 6, right: x + 6, bottom: y + 6 };
    }
    const x = (bart.x + descriptor.x_offset - this.cameraX) * zoom;
    const y = (bart.y + descriptor.y_offset) * zoom;
    return {
      left: x,
      top: y,
      right: x + descriptor.width_pixels * zoom,
      bottom: y + descriptor.height_pixels * zoom,
    };
  }

  private objectScreenRect(object: GameObjectRuntime): ScreenRect {
    const zoom = this.options.zoom;
    const descriptor = object.descriptor;
    if (!descriptor) {
      const x = (object.x - this.cameraX) * zoom;
      const y = object.y * zoom;
      return { left: x - 5, top: y - 5, right: x + 5, bottom: y + 5 };
    }

    const x = (object.x + descriptor.x_offset - this.cameraX) * zoom;
    const y = (object.y + descriptor.y_offset) * zoom;
    return {
      left: x,
      top: y,
      right: x + descriptor.width_pixels * zoom,
      bottom: y + descriptor.height_pixels * zoom,
    };
  }
}
