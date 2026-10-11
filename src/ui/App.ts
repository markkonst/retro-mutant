import { AssetRepository } from "../game/AssetRepository.js";
import { COLLISION_HANDLER_NAMES, getCollisionHandlerInfo } from "../game/CollisionSystem.js";
import { RuntimeWorld } from "../game/RuntimeWorld.js";
import { INVENTORY_ITEMS } from "../game/InventorySystem.js";
import { SimulationLoop } from "../game/SimulationLoop.js";
import { WorldViewer } from "../game/WorldViewer.js";
import { BartInputState, BartRuntime, GameObjectRuntime, LevelNumber } from "../game/types.js";

function requiredElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

function hex(value: number, width = 4): string {
  return `0x${(value & 0xffff).toString(16).toUpperCase().padStart(width, "0")}`;
}

function fixed88(value: number): string {
  return `${value} (${(value / 256).toFixed(3)} px/tick)`;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (ch) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch] ?? ch));
}

function formatArgs(args: Record<string, unknown>): string {
  const parts = Object.entries(args).filter(([key]) => key !== "name").map(([key, value]) => {
    if (typeof value === "number") return `${key}=${value} (${hex(value)})`;
    if (Array.isArray(value)) return `${key}=[${value.join(", ")}]`;
    return `${key}=${String(value)}`;
  });
  return parts.join(" · ");
}

const COWABUNGA_CODES = ["KeyC", "KeyO", "KeyW", "KeyA", "KeyB", "KeyU", "KeyN", "KeyG", "KeyA"] as const;
const EATMYSHORTS_CODES = ["NumpadSubtract", "KeyE", "KeyA", "KeyT", "KeyM", "KeyY", "KeyS", "KeyH", "KeyO", "KeyR", "KeyT", "KeyS"] as const;

export class App {
  private readonly repository = new AssetRepository();
  private readonly viewer: WorldViewer;
  private readonly loop: SimulationLoop;
  private world: RuntimeWorld | null = null;
  private loadingGeneration = 0;
  private selectedObject: GameObjectRuntime | null = null;
  private selectedBart = false;
  private bartInput: BartInputState = { left: false, right: false, jump: false, down: false, action: false, inventory: false };
  private debugInvulnerable = false;
  private cheatCowabunga = false;
  private cheatEatMyShorts = false;
  private cheatSequence: "cowabunga" | "eatmyshorts" | null = null;
  private cheatProgress = 0;
  private levelAdvancePending = false;

  private readonly levelSelect = requiredElement<HTMLSelectElement>("level-select");
  private readonly cameraSlider = requiredElement<HTMLInputElement>("camera-slider");
  private readonly cameraInput = requiredElement<HTMLInputElement>("camera-input");
  private readonly zoomSelect = requiredElement<HTMLSelectElement>("zoom-select");
  private readonly tickRateSelect = requiredElement<HTMLSelectElement>("tick-rate-select");
  private readonly playButton = requiredElement<HTMLButtonElement>("play-button");
  private readonly stepButton = requiredElement<HTMLButtonElement>("step-button");
  private readonly resetButton = requiredElement<HTMLButtonElement>("reset-button");
  private readonly selectBartButton = requiredElement<HTMLButtonElement>("select-bart-button");
  private readonly followBart = requiredElement<HTMLInputElement>("follow-bart");
  private readonly physicsCollisions = requiredElement<HTMLInputElement>("toggle-physics-collisions");
  private readonly collisionState = requiredElement<HTMLSpanElement>("collision-state");
  private readonly invulnerableButton = requiredElement<HTMLButtonElement>("invulnerable-button");
  private readonly invulnerableState = requiredElement<HTMLSpanElement>("invulnerable-state");
  private readonly cheatState = requiredElement<HTMLSpanElement>("cheat-state");
  private readonly debugHudToggle = requiredElement<HTMLInputElement>("toggle-debug-hud");
  private readonly gameHud = requiredElement<HTMLDivElement>("game-hud");
  private readonly status = requiredElement<HTMLDivElement>("status");
  private readonly inspector = requiredElement<HTMLDivElement>("inspector-content");
  private readonly stats = requiredElement<HTMLDivElement>("stats");
  private readonly hudLives = requiredElement<HTMLElement>("hud-lives");
  private readonly hudHealth = requiredElement<HTMLElement>("hud-health");
  private readonly hudScore = requiredElement<HTMLElement>("hud-score");
  private readonly hudTime = requiredElement<HTMLElement>("hud-time");
  private readonly hudGoals = requiredElement<HTMLElement>("hud-goals");
  private readonly hudState = requiredElement<HTMLElement>("hud-state");
  private readonly hudEvent = requiredElement<HTMLElement>("hud-event");

  constructor() {
    this.viewer = new WorldViewer(requiredElement<HTMLCanvasElement>("world-canvas"));
    this.viewer.setSelectionListener(({ object, bart }) => {
      this.selectedObject = object;
      this.selectedBart = bart !== null;
      if (bart) this.updateBartInspector(bart);
      else this.updateObjectInspector(object);
    });
    this.viewer.setCameraListener(() => this.updateCameraControls());

    this.loop = new SimulationLoop(
      () => this.tick(),
      () => this.render(),
    );
    this.loop.setTicksPerSecond(Number(this.tickRateSelect.value));
    this.installUiHandlers();
    this.installKeyboardHandlers();
  }

  async start(): Promise<void> {
    this.loop.start();
    await this.loadLevel(1);
  }

  private async loadLevel(level: LevelNumber): Promise<void> {
    const generation = ++this.loadingGeneration;
    this.levelAdvancePending = false;
    this.loop.setRunning(false);
    this.updatePlayButton();
    this.status.textContent = `Level ${level} + ScriptVM + Bart-data laden…`;
    this.levelSelect.disabled = true;

    try {
      const loaded = await this.repository.loadLevel(level);
      if (generation !== this.loadingGeneration) return;

      this.world?.dispose();
      this.world = new RuntimeWorld(loaded);
      this.world.setCollisionsEnabled(this.physicsCollisions.checked);
      this.world.setDebugInvulnerable(this.debugInvulnerable);
      if (this.cheatCowabunga) this.world.activateCowabungaCheat();
      if (this.cheatEatMyShorts) this.world.activateEatMyShortsCheat();
      this.viewer.setWorld(loaded, this.world);
      this.levelSelect.value = String(level);
      this.clearBartInput();
      this.updateCameraControls();
      this.updateStats();
      this.updateHud();
      this.updateCollisionState();
      this.updateDebugState();
      this.status.textContent = `Level ${level} klaar — Bart + terrain/object collisions ${this.physicsCollisions.checked ? "actief" : "uitgeschakeld"}.`;

      this.loop.setRunning(true);
      this.updatePlayButton();
    } catch (error) {
      console.error(error);
      this.status.textContent = error instanceof Error ? error.message : String(error);
    } finally {
      if (generation === this.loadingGeneration) this.levelSelect.disabled = false;
    }
  }

  private tick(): void {
    this.world?.tick(this.bartInput);
    if (this.world?.levelFinished) {
      this.handleLevelFinished();
      return;
    }
    if (this.world?.consumePauseRequest()) {
      this.loop.setRunning(false);
      this.updatePlayButton();
      this.status.textContent = "PAUSE via inventory — druk F8/Play om verder te gaan.";
    }
    if (this.followBart.checked) this.viewer.followBartDeadZone();
  }

  private handleLevelFinished(): void {
    if (!this.world || this.levelAdvancePending) return;
    this.levelAdvancePending = true;
    this.loop.setRunning(false);
    this.updatePlayButton();
    const current = this.world.level.level;
    if (current >= 5) {
      this.status.textContent = "Level 5 complete — DOS level-finished flag reached (completion presentation not yet decoded).";
      return;
    }
    const next = (current + 1) as LevelNumber;
    this.status.textContent = `Level ${current} complete — viewer laadt Level ${next}; originele completion presentation is nog niet gemodelleerd.`;
    void this.loadLevel(next).finally(() => { this.levelAdvancePending = false; });
  }

  private render(): void {
    this.viewer.render();
    this.updateStats();
    this.updateHud();
    if (this.selectedBart && this.world) {
      this.updateBartInspector(this.world.bart);
    } else if (this.selectedObject) {
      const current = this.world?.getObjectBySourceIndex(this.selectedObject.source.index) ?? null;
      this.selectedObject = current;
      this.updateObjectInspector(current);
    }
  }

  private installUiHandlers(): void {
    this.levelSelect.addEventListener("change", () => {
      void this.loadLevel(Number(this.levelSelect.value) as LevelNumber);
    });

    this.playButton.addEventListener("click", () => this.togglePlay());

    this.stepButton.addEventListener("click", () => {
      this.loop.setRunning(false);
      this.updatePlayButton();
      this.loop.stepOnce();
    });

    this.resetButton.addEventListener("click", () => {
      this.levelAdvancePending = false;
      this.world?.reset();
      this.clearBartInput();
      this.loop.setRunning(false);
      this.updatePlayButton();
      this.viewer.clearSelection();
      if (this.followBart.checked) this.viewer.followBartDeadZone();
      this.render();
    });

    this.selectBartButton.addEventListener("click", () => this.viewer.selectBart());

    this.tickRateSelect.addEventListener("change", () => {
      this.loop.setTicksPerSecond(Number(this.tickRateSelect.value));
    });

    this.cameraSlider.addEventListener("input", () => {
      this.viewer.setCameraX(Number(this.cameraSlider.value));
      this.updateCameraControls();
    });
    this.cameraInput.addEventListener("change", () => {
      this.viewer.setCameraX(Number(this.cameraInput.value));
      this.updateCameraControls();
    });
    this.zoomSelect.addEventListener("change", () => {
      this.viewer.setOptions({ zoom: Number(this.zoomSelect.value) });
      this.updateCameraControls();
    });

    requiredElement<HTMLButtonElement>("home-button").addEventListener("click", () => this.viewer.setCameraX(0));
    requiredElement<HTMLButtonElement>("prev-screen-button").addEventListener("click", () => this.viewer.panBy(-320));
    requiredElement<HTMLButtonElement>("next-screen-button").addEventListener("click", () => this.viewer.panBy(320));
    requiredElement<HTMLButtonElement>("end-button").addEventListener("click", () => this.viewer.jumpToEnd());

    const bindToggle = (id: string, key: "showSourceAnchors" | "showLabels" | "showCollision" | "showTerrain" | "showInvisibleControllers" | "showBlockedVm"): void => {
      const checkbox = requiredElement<HTMLInputElement>(id);
      checkbox.addEventListener("change", () => this.viewer.setOptions({ [key]: checkbox.checked }));
    };
    bindToggle("toggle-anchors", "showSourceAnchors");
    bindToggle("toggle-labels", "showLabels");
    bindToggle("toggle-collision", "showCollision");
    bindToggle("toggle-terrain", "showTerrain");
    bindToggle("toggle-invisible", "showInvisibleControllers");
    bindToggle("toggle-blocked", "showBlockedVm");
    this.debugHudToggle.addEventListener("change", () => {
      this.gameHud.classList.toggle("debug-visible", this.debugHudToggle.checked);
    });
    this.gameHud.classList.toggle("debug-visible", this.debugHudToggle.checked);

    this.invulnerableButton.addEventListener("click", () => {
      this.debugInvulnerable = !this.debugInvulnerable;
      this.world?.setDebugInvulnerable(this.debugInvulnerable);
      this.updateDebugState();
      this.status.textContent = this.debugInvulnerable
        ? "Viewer invulnerability ON — normale damage wordt genegeerd zonder DOS blink-timer."
        : "Viewer invulnerability OFF — normale DOS damage is weer actief.";
    });
    this.updateDebugState();

    this.physicsCollisions.addEventListener("change", () => {
      this.world?.setCollisionsEnabled(this.physicsCollisions.checked);
      this.updateCollisionState();
      this.status.textContent = this.physicsCollisions.checked
        ? "Physics collisions ingeschakeld."
        : "Physics collisions uitgeschakeld (debugmodus).";
    });
    this.updateCollisionState();
  }

  private installKeyboardHandlers(): void {
    window.addEventListener("keydown", (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement || event.target instanceof HTMLButtonElement) return;

      let handled = this.handleCheatKey(event.code, event.repeat);
      switch (event.code) {
        case "ArrowLeft":
        case "KeyO":
          this.bartInput.left = true;
          handled = true;
          break;
        case "ArrowRight":
        case "KeyP":
          this.bartInput.right = true;
          handled = true;
          break;
        case "ArrowUp":
        case "KeyQ":
          this.bartInput.jump = true;
          handled = true;
          break;
        case "ArrowDown":
        case "KeyA":
          this.bartInput.down = true;
          handled = true;
          break;
        case "Space":
          this.bartInput.action = true;
          handled = true;
          break;
        case "KeyF":
          if (!event.repeat && this.world?.triggerEatMyShortsLevelSkip()) {
            this.status.textContent = "-EATMYSHORTS: F activeerde de normale level-finished flag.";
            this.handleLevelFinished();
            handled = true;
          }
          break;
        case "F8":
          if (!event.repeat) this.togglePlay();
          handled = true;
          break;
        case "Period":
          if (!event.repeat) {
            this.loop.setRunning(false);
            this.updatePlayButton();
            this.loop.stepOnce();
          }
          handled = true;
          break;
        case "PageUp":
          this.viewer.panBy(-320);
          handled = true;
          break;
        case "PageDown":
          this.viewer.panBy(320);
          handled = true;
          break;
        case "Home":
          this.viewer.setCameraX(0);
          handled = true;
          break;
        case "End":
          this.viewer.jumpToEnd();
          handled = true;
          break;
      }

      if (handled) {
        event.preventDefault();
        this.updateCameraControls();
      }
    });

    window.addEventListener("keyup", (event) => {
      let handled = true;
      switch (event.code) {
        case "ArrowLeft":
        case "KeyO":
          this.bartInput.left = false;
          break;
        case "ArrowRight":
        case "KeyP":
          this.bartInput.right = false;
          break;
        case "ArrowUp":
        case "KeyQ":
          this.bartInput.jump = false;
          break;
        case "ArrowDown":
        case "KeyA":
          this.bartInput.down = false;
          break;
        case "Space":
          this.bartInput.action = false;
          break;
        default:
          handled = false;
      }
      if (handled) event.preventDefault();
    });

    window.addEventListener("blur", () => this.clearBartInput());
  }

  /**
   * DOS used Set-1 make scancodes and two progress bytes. event.code gives us
   * the same physical-key distinction needed for keypad-minus. The original
   * executable listened on startup/title screens; the viewer has no such
   * screen, so the sequence listener remains available while the viewer runs.
   */
  private handleCheatKey(code: string, repeat: boolean): boolean {
    if (repeat) return this.cheatSequence !== null;

    const startSequence = (): boolean => {
      if (code === COWABUNGA_CODES[0]) { this.cheatSequence = "cowabunga"; this.cheatProgress = 1; return true; }
      if (code === EATMYSHORTS_CODES[0]) { this.cheatSequence = "eatmyshorts"; this.cheatProgress = 1; return true; }
      return false;
    };

    if (this.cheatSequence === null) return startSequence();
    const sequence = this.cheatSequence === "cowabunga" ? COWABUNGA_CODES : EATMYSHORTS_CODES;
    if (code !== sequence[this.cheatProgress]) {
      this.cheatSequence = null;
      this.cheatProgress = 0;
      return startSequence();
    }

    this.cheatProgress++;
    if (this.cheatProgress < sequence.length) return true;

    if (this.cheatSequence === "cowabunga") {
      this.cheatCowabunga = true;
      this.world?.activateCowabungaCheat();
      this.status.textContent = "COWABUNGA geactiveerd — DOS unlimited-lives flag 06F9h=AC.";
    } else {
      this.cheatEatMyShorts = true;
      this.world?.activateEatMyShortsCheat();
      this.status.textContent = "-EATMYSHORTS geactiveerd — unlimited lives; F zet level-finished.";
    }
    this.cheatSequence = null;
    this.cheatProgress = 0;
    this.updateDebugState();
    return true;
  }

  private clearBartInput(): void {
    this.bartInput = { left: false, right: false, jump: false, down: false, action: false, inventory: false };
  }

  private togglePlay(): void {
    this.loop.setRunning(!this.loop.isRunning());
    this.updatePlayButton();
  }

  private updatePlayButton(): void {
    this.playButton.textContent = this.loop.isRunning() ? "Pause" : "Play";
  }

  private updateCameraControls(): void {
    const cameraX = Math.round(this.viewer.getCameraX());
    const max = Math.max(0, Math.round(this.viewer.getWorldWidth() - this.viewer.getViewportWorldWidth()));
    this.cameraSlider.max = String(max);
    this.cameraSlider.value = String(Math.min(max, cameraX));
    this.cameraInput.max = String(max);
    this.cameraInput.value = String(cameraX);
    this.zoomSelect.value = String(this.viewer.getOptions().zoom);
  }

  private updateDebugState(): void {
    this.invulnerableButton.textContent = `🛡 Invulnerable: ${this.debugInvulnerable ? "ON" : "OFF"}`;
    this.invulnerableButton.classList.toggle("active", this.debugInvulnerable);
    this.invulnerableButton.setAttribute("aria-pressed", String(this.debugInvulnerable));
    this.invulnerableState.classList.toggle("hidden", !this.debugInvulnerable);
    const cheats = [this.cheatCowabunga ? "COWABUNGA" : "", this.cheatEatMyShorts ? "-EATMYSHORTS" : ""].filter(Boolean);
    this.cheatState.textContent = `DOS cheats: ${cheats.length ? cheats.join(" + ") : "none"}`;
  }

  private updateCollisionState(): void {
    const enabled = this.world?.areCollisionsEnabled() ?? this.physicsCollisions.checked;
    this.collisionState.textContent = `collisions: ${enabled ? "ON" : "OFF"}`;
    this.collisionState.className = enabled ? "collision-on" : "collision-off";
  }

  private updateStats(): void {
    const stats = this.world?.getStats();
    const bart = this.world?.bart;
    if (!stats || !bart) {
      this.stats.textContent = "";
      return;
    }
    const support = bart.supportKind === "object" && bart.supportSourceIndex !== null
      ? `object#${bart.supportSourceIndex}`
      : bart.supportKind;
    const collisionMode = this.world?.areCollisionsEnabled() ? "ON" : "OFF";
    const health = this.world?.healthPoints ?? 0;
    const lives = this.world?.hud.livesRemaining ?? 0;
    const selectedItem = this.world ? INVENTORY_ITEMS[this.world.collisionState.inventory.selectedItem]?.name ?? "?" : "?";
    const debugMode = this.debugInvulnerable ? " · INVULN" : "";
    const cheatMode = this.cheatCowabunga || this.cheatEatMyShorts ? " · CHEAT" : "";
    this.stats.textContent = `tick ${stats.tick} · Bart ${bart.x},${bart.y} D${bart.spriteDescriptorId} · HP ${health}/2 · lives ${lives} · inv ${selectedItem} · support ${support} · physics ${collisionMode}${debugMode}${cheatMode} · collision events ${stats.collisionEvents} · active ${stats.activeObjects} · blocked ${stats.blockedObjects}`;
  }

  private updateHud(): void {
    const world = this.world;
    if (!world) return;
    const hud = world.hud;
    const bart = world.bart;
    const health = world.healthPoints;

    this.hudLives.textContent = String(hud.livesRemaining).padStart(1, "0");
    this.hudHealth.textContent = `${"●".repeat(health)}${"○".repeat(Math.max(0, hud.maxHealthPoints - health))}`;
    this.hudHealth.setAttribute("aria-label", `${health} of ${hud.maxHealthPoints} health`);
    this.hudScore.textContent = String(hud.score).padStart(6, "0");
    this.hudTime.textContent = String(hud.levelTimer).padStart(3, "0");
    this.hudGoals.textContent = String(hud.goalsRemaining).padStart(2, "0");

    if (hud.gameOver) {
      this.hudState.textContent = "GAME OVER";
      this.hudState.className = "hud-state hud-danger";
    } else if (this.debugInvulnerable) {
      this.hudState.textContent = "INVULN DEBUG";
      this.hudState.className = "hud-state hud-invulnerable";
    } else if (bart.hitDeathTimer > 0) {
      this.hudState.textContent = `HIT ${bart.hitDeathTimer}`;
      this.hudState.className = "hud-state hud-hit";
    } else if (bart.invulnerabilityTimer > 0) {
      this.hudState.textContent = `INV ${bart.invulnerabilityTimer} · P${bart.blinkPhase}`;
      this.hudState.className = "hud-state hud-invulnerable";
    } else {
      this.hudState.textContent = "READY";
      this.hudState.className = "hud-state";
    }
    this.hudEvent.textContent = hud.lastEvent ?? "";
  }

  private updateBartInspector(bart: BartRuntime): void {
    const descriptor = bart.descriptor;
    this.inspector.innerHTML = `
      <h3 class="bart-heading">Bart player</h3>
      <dl class="inspector-grid">
        <dt>Runtime X/Y</dt><dd>${bart.x}, ${bart.y}</dd>
        <dt>Default groundY</dt><dd>${bart.groundY}</dd>
        <dt>Support</dt><dd>${bart.supportKind}${bart.supportSourceIndex === null ? "" : ` (source #${bart.supportSourceIndex})`} @ Y ${bart.supportY}</dd>
        <dt>World max X</dt><dd>${bart.maxX}</dd>
        <dt>Facing</dt><dd>${bart.facing === 0 ? "right (0)" : "left (1)"}</dd>
        <dt>Airborne</dt><dd>${bart.airborne ? "yes" : "no"}</dd>
        <dt>Velocity X</dt><dd>${fixed88(bart.velocityX)}</dd>
        <dt>Velocity Y</dt><dd>${fixed88(bart.velocityY)}</dd>
        <dt>Max speed X</dt><dd>${fixed88(bart.maxSpeedX)}</dd>
        <dt>Jump hold</dt><dd>${bart.jumpHoldCounter}</dd>
        <dt>Brake/idle</dt><dd>${bart.brakeIdleState}</dd>
        <dt>Anim base</dt><dd>${bart.animationBase}</dd>
        <dt>Anim frame</dt><dd>${bart.animationFrame}</dd>
        <dt>Anim timer</dt><dd>${bart.animationTimer} / reload ${bart.animationReload}</dd>
        <dt>Bart descriptor</dt><dd>#${bart.spriteDescriptorId}</dd>
        <dt>Health</dt><dd>${this.world?.healthPoints ?? 0} / ${this.world?.hud.maxHealthPoints ?? 2}</dd>
        <dt>Lives</dt><dd>${this.world?.hud.livesRemaining ?? 0}</dd>
        <dt>Hit/death timer</dt><dd>${bart.hitDeathTimer}</dd>
        <dt>Invuln timer</dt><dd>${bart.invulnerabilityTimer}</dd>
        <dt>Blink phase</dt><dd>${bart.blinkPhase} (render ${bart.renderVisible ? "visible" : "hidden"})</dd>
        <dt>HUD score/time</dt><dd>${String(this.world?.hud.score ?? 0).padStart(6, "0")} / ${String(this.world?.hud.levelTimer ?? 0).padStart(3, "0")}</dd>
        <dt>Goals</dt><dd>${this.world?.hud.goalsRemaining ?? 0} / ${this.world?.hud.goalsInitial ?? 0}</dd>
        <dt>Inventory selected</dt><dd>${this.world ? `${this.world.collisionState.inventory.selectedItem}: ${INVENTORY_ITEMS[this.world.collisionState.inventory.selectedItem]?.name ?? "?"}` : "—"}</dd>
        <dt>Inventory counts</dt><dd>${this.world ? this.world.collisionState.inventoryCounts.map((v, i) => `${i}:${hex(v, 2)}`).join(" · ") : "—"}</dd>
        <dt>Inventory mode</dt><dd>${this.world?.collisionState.inventory.modeHeld ? "OPEN" : "closed"} · repeat ${this.world?.collisionState.inventory.repeatTimer ?? 0} · timeout ${this.world?.collisionState.inventory.displayTimeout ?? 0}</dd>
        <dt>Action state</dt><dd>${this.world ? `${hex(this.world.collisionState.inventory.bartActionState)} · ${this.world.collisionState.inventory.actionActive ? "ACTIVE" : "idle"} · ${this.world.collisionState.inventory.lastAction ?? "—"}` : "—"}</dd>
        <dt>Weapon meter</dt><dd>${this.world ? `spray=${this.world.collisionState.sprayMeter0815} · sling=${this.world.collisionState.level3Meter0782} · dart=${this.world.collisionState.level4Meter0781}` : "—"}</dd>
        <dt>Collision events</dt><dd>${bart.collisionCount}</dd>
        <dt>Collision globals</dt><dd>${this.world ? `0766=${hex(this.world.collisionState.levelProgress0766)} · 0768=${hex(this.world.collisionState.patternState0768)} · 076A=${hex(this.world.collisionState.sequenceCounter076A)} · 076C=${hex(this.world.collisionState.toggle076C)} · 0780=${hex(this.world.collisionState.specialCounter0780)} · 0784=${hex(this.world.collisionState.collisionLatch0784)}` : "—"}</dd>
        <dt>Last deferred handler</dt><dd>${this.world?.collisionState.lastDeferredHandler === null || this.world?.collisionState.lastDeferredHandler === undefined ? "—" : `${this.world.collisionState.lastDeferredHandler}: ${this.world.collisionState.lastDeferredReason}`}</dd>
        <dt>Last collision</dt><dd>${bart.lastCollision ?? "—"}</dd>
        <dt>Sprite size</dt><dd>${descriptor ? `${descriptor.width_pixels}×${descriptor.height_pixels}` : "—"}</dd>
        <dt>Sprite offset</dt><dd>${descriptor ? `${descriptor.x_offset}, ${descriptor.y_offset}` : "—"}</dd>
      </dl>
      <p class="ok">Player control + collision core ${this.world?.areCollisionsEnabled() ? "actief" : "uitgeschakeld"}.</p>
      <p class="muted">Actief: StaticTerrain landing/springs, 12×24 Bart hitbox, object AABB, horizontal solids, one-way/moving platforms, bounce/hazard core, damage + DOS blink/invulnerability, DOS HUD lives/score/time/goals, 14-slot inventory, item-use state, spray action-hitbox, weapon meters/projectiles, bewezen pickups en veilige type-transitions. Boss/linked-object side-effects blijven geparkeerd waar hun globale state nog ontbreekt.</p>
    `;
  }

  private updateObjectInspector(object: GameObjectRuntime | null): void {
    if (!object) {
      this.inspector.innerHTML = "<p>Klik op Bart, een runtime sprite of source-marker.</p>";
      return;
    }

    const descriptor = object.descriptor;
    const collision = object.collision;
    const handlerInfo = collision ? getCollisionHandlerInfo(collision.collision_index) : null;
    const vmClass = object.vmState === "blocked" ? "warn" : object.vmState === "despawned" ? "muted" : "ok";
    const wait = object.vmWait;
    const waitSummary = wait ? `
      <section class="vm-summary vm-waiting">
        <strong>WAITING @ ${hex(wait.originPc)}</strong> → resume ${hex(wait.resumePc)}
        <span>reason ${escapeHtml(wait.reason)} · delay ${hex(object.scriptDelay)} (${object.scriptDelay}) · started tick ${wait.startedAtTick}${wait.threshold === null ? "" : ` · threshold ${wait.threshold} · current Y ${object.y}`}</span>
        <span>${escapeHtml(wait.detail ?? "")}</span>
      </section>` : "";
    const branch = object.vmLastBranch;
    const branchSummary = branch ? `
      <section class="vm-summary vm-branch">
        <strong>LAST BRANCH @ ${hex(branch.pc)}</strong> → ${branch.targetPc === null ? "—" : hex(branch.targetPc)}
        <span>tick ${branch.tick} · ${escapeHtml(branch.kind)} · ${escapeHtml(branch.detail ?? "")}</span>
      </section>` : "";

    const scriptRows = object.flow ? object.flow.instructions.map((instruction) => {
      const state = object.vmInstructionStates.get(instruction.pc);
      const isBlocked = object.vmState === "blocked" && object.lastInstructionPc === instruction.pc;
      const isWaiting = wait?.originPc === instruction.pc;
      const isNext = wait?.resumePc === instruction.pc;
      const isCurrent = !wait && object.vmState === "ready" && object.scriptPC === instruction.pc;
      const isBranch = branch?.pc === instruction.pc;
      let status = "never", cls = "vm-never";
      if (isBlocked) { status = "BLOCKED"; cls = "vm-blocked"; }
      else if (isWaiting) { status = "WAITING"; cls = "vm-waiting"; }
      else if (isCurrent) { status = "CURRENT"; cls = "vm-current"; }
      else if (isNext) { status = "NEXT"; cls = "vm-next"; }
      else if (isBranch) { status = "BRANCH"; cls = "vm-branch"; }
      else if ((state?.visits ?? 0) > 0) { status = "executed"; cls = "vm-executed"; }
      const details = [formatArgs(instruction.args), state?.lastDetail ?? ""].filter(Boolean).join(" | ");
      return `<tr class="${cls}"><td>${status}</td><td>${hex(instruction.pc)}</td><td><strong>${escapeHtml(instruction.name)}</strong><small>${escapeHtml(details)}</small></td><td>${state?.visits ?? 0}</td><td>${state?.lastTick ?? "—"}</td></tr>`;
    }).join("") : `<tr><td colspan="5">No decoded script flow.</td></tr>`;

    const historyRows = object.vmHistory.slice().reverse().map((h) =>
      `<tr><td>${h.tick}</td><td>${hex(h.pc)}</td><td>${escapeHtml(h.name)}</td><td>${escapeHtml(h.outcome)}</td><td>${escapeHtml(h.detail ?? "")}</td></tr>`
    ).join("");

    this.inspector.innerHTML = `
      <dl class="inspector-grid">
        <dt>Runtime slot</dt><dd>${object.slotIndex} / 27${object.parentRuntimeId === null ? "" : ` · child of slot ${object.parentRuntimeId}`}</dd>
        <dt>Source</dt><dd>${object.sourceAttached ? `#${object.source.index} @ ${hex(object.source.offset)}` : `transient (${object.source.index})`}</dd>
        <dt>Type</dt><dd>${object.typeId} (${hex(object.typeOffset)})</dd>
        <dt>Source start</dt><dd>${object.source.x}, ${object.source.y}</dd>
        <dt>Runtime X/Y</dt><dd>${object.x}, ${object.y}</dd>
        <dt>Flags</dt><dd>${hex(object.flags)} / runtime ${hex(object.runtimeFlags)}</dd>
        <dt>Script entry</dt><dd>${object.flow ? hex(object.flow.entry_offset) : "—"}</dd>
        <dt>Script PC</dt><dd>${hex(object.scriptPC)}</dd>
        <dt>scriptDelay</dt><dd>${hex(object.scriptDelay)} (${object.scriptDelay})</dd>
        <dt>Last opcode</dt><dd>${escapeHtml(object.lastInstructionName ?? "—")}${object.lastInstructionPc === null ? "" : ` @ ${hex(object.lastInstructionPc)}`}</dd>
        <dt>VM state</dt><dd class="${vmClass}">${object.vmState}</dd>
        <dt>Executed</dt><dd>${object.instructionsExecuted} instructions</dd>
        <dt>Velocity X/Y</dt><dd>${fixed88(object.velocityX)} / ${fixed88(object.velocityY)}</dd>
        <dt>Accel X/Y</dt><dd>${fixed88(object.accelerationX)} / ${fixed88(object.accelerationY)}</dd>
        <dt>Animation</dt><dd>base ${hex(object.animBase)} · frame ${object.animFrame}/${object.animFrameCount} · timer ${hex(object.animTimer)} reload ${hex(object.animReload)}</dd>
        <dt>Descriptor</dt><dd>${object.descriptorIndex === null ? "—" : `${object.descriptorBank ?? "?"} #${object.descriptorIndex}`}</dd>
        <dt>Sprite</dt><dd>${descriptor ? `${descriptor.width_pixels}×${descriptor.height_pixels} @ ${descriptor.x_offset},${descriptor.y_offset}` : "—"}</dd>
        <dt>Last sound</dt><dd>${object.lastSoundId === null ? "—" : hex(object.lastSoundId, 2)}</dd>
        <dt>Event text</dt><dd>${object.eventTextSnapshot ? escapeHtml(object.eventTextSnapshot.join(" / ")) : "—"}</dd>
        <dt>Collision data</dt><dd>${collision ? `handler ${collision.collision_index} (${COLLISION_HANDLER_NAMES[collision.collision_index] ?? "unknown"}), ${collision.width}×${collision.height} @ ${collision.x_offset},${collision.y_offset}, param ${collision.parameter}` : "—"}</dd>
        <dt>Collision fidelity</dt><dd>${handlerInfo ? `${handlerInfo.fidelity} · DOS ${hex(handlerInfo.dosOffset)}` : "—"}</dd>
      </dl>
      ${object.vmMessage ? `<p class="warn">${escapeHtml(object.vmMessage)}</p>` : ""}
      ${object.vmNote ? `<p class="muted">${escapeHtml(object.vmNote)}</p>` : ""}
      ${waitSummary}${branchSummary}
      <h3>VM Script</h3>
      <div class="vm-table-wrap"><table class="vm-table"><thead><tr><th>Status</th><th>PC</th><th>Instruction</th><th>Visits</th><th>Last tick</th></tr></thead><tbody>${scriptRows}</tbody></table></div>
      <h3>VM execution history <small>(last ${object.vmHistory.length})</small></h3>
      <div class="vm-table-wrap"><table class="vm-table vm-history"><thead><tr><th>Tick</th><th>PC</th><th>Instruction</th><th>Outcome</th><th>Detail</th></tr></thead><tbody>${historyRows || `<tr><td colspan="5">Nog geen VM-stappen uitgevoerd.</td></tr>`}</tbody></table></div>
    `;
  }}
