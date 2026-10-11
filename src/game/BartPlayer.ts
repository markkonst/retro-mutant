import { BartInputState, BartRuntime, BartSupportKind, LoadedLevel } from "./types.js";

function u16(value: number): number {
  return value & 0xffff;
}

function s16(value: number): number {
  const v = value & 0xffff;
  return (v & 0x8000) !== 0 ? v - 0x10000 : v;
}

function s8(value: number): number {
  const v = value & 0xff;
  return (v & 0x80) !== 0 ? v - 0x100 : v;
}

/** DOS Bart horizontal movement applies the signed high byte as whole pixels. */
function wholePixelsTowardZero(fixed88: number): number {
  const value = s16(fixed88);
  return value < 0 ? -((-value) >>> 8) : value >>> 8;
}

export class BartPlayer {
  readonly state: BartRuntime;
  private jumpLatch = false;
  private gravityPhase = false;
  private forcedJumpHold = false;
  private actionConsumedThisTick = false;
  private debugInvulnerable = false;

  constructor(private readonly level: LoadedLevel) {
    const config = level.playerConfig;
    this.state = {
      x: config.start_x,
      y: config.ground_y_default,
      groundY: config.ground_y_default,
      supportY: config.ground_y_default,
      supportKind: "ground",
      supportSourceIndex: null,
      minX: 0,
      maxX: config.bart_max_x,
      velocityX: 0,
      velocityY: 0,
      maxSpeedX: config.initial_max_speed_x_fixed_8_8,
      facing: 0,
      airborne: false,
      jumpHoldCounter: 0,
      brakeIdleState: 0,
      idleTimer: 0,
      idleAnimCounter: 0,
      animationBase: 0,
      animationFrame: 0,
      animationTimer: 0,
      animationReload: config.initial_animation_reload,
      spriteDescriptorId: 16,
      descriptor: null,
      image: null,
      hitDeathTimer: 0,
      invulnerabilityTimer: 0,
      blinkPhase: 0,
      renderVisible: true,
      collisionCount: 0,
      lastCollision: null,
    };
    this.refreshSprite();
  }

  reset(): void {
    const config = this.level.playerConfig;
    const bart = this.state;
    bart.x = config.start_x;
    bart.y = config.ground_y_default;
    bart.groundY = config.ground_y_default;
    bart.supportY = config.ground_y_default;
    bart.supportKind = "ground";
    bart.supportSourceIndex = null;
    bart.minX = 0;
    bart.maxX = config.bart_max_x;
    bart.velocityX = 0;
    bart.velocityY = 0;
    bart.maxSpeedX = config.initial_max_speed_x_fixed_8_8;
    bart.facing = 0;
    bart.airborne = false;
    bart.jumpHoldCounter = 0;
    bart.brakeIdleState = 0;
    bart.idleTimer = 0;
    bart.idleAnimCounter = 0;
    bart.animationBase = 0;
    bart.animationFrame = 0;
    bart.animationTimer = 0;
    bart.animationReload = config.initial_animation_reload;
    bart.spriteDescriptorId = 16;
    bart.hitDeathTimer = 0;
    bart.invulnerabilityTimer = 0;
    bart.blinkPhase = 0;
    bart.renderVisible = true;
    bart.collisionCount = 0;
    bart.lastCollision = null;
    this.jumpLatch = false;
    this.gravityPhase = false;
    this.forcedJumpHold = false;
    this.actionConsumedThisTick = false;
    this.refreshSprite();
  }

  /**
   * Reduced respawn equivalent of RepositionBartAndRebuildViewport +
   * ResetBartAndGameplayState. The checkpoint table is not modeled yet, so
   * this milestone returns to the exported level start while preserving the
   * already-running 083Dh invulnerability timer, just like the DOS reset path.
   */
  respawnAtLevelStart(): void {
    const config = this.level.playerConfig;
    const bart = this.state;
    const invulnerabilityTimer = bart.invulnerabilityTimer;
    const collisionCount = bart.collisionCount;
    const lastCollision = bart.lastCollision;

    bart.x = config.start_x;
    bart.y = config.ground_y_default;
    bart.groundY = config.ground_y_default;
    bart.supportY = config.ground_y_default;
    bart.supportKind = "ground";
    bart.supportSourceIndex = null;
    bart.velocityX = 0;
    bart.velocityY = 0;
    bart.maxSpeedX = config.initial_max_speed_x_fixed_8_8;
    bart.facing = 0;
    bart.airborne = false;
    bart.jumpHoldCounter = 0;
    bart.brakeIdleState = 0;
    bart.idleTimer = 0;
    bart.idleAnimCounter = 0;
    bart.animationBase = 0;
    bart.animationFrame = 0;
    bart.animationTimer = 0;
    bart.animationReload = config.initial_animation_reload;
    bart.spriteDescriptorId = 16;
    bart.hitDeathTimer = 0;
    bart.invulnerabilityTimer = invulnerabilityTimer;
    bart.blinkPhase = 0;
    bart.renderVisible = true;
    bart.collisionCount = collisionCount;
    bart.lastCollision = lastCollision;
    this.jumpLatch = false;
    this.gravityPhase = false;
    this.forcedJumpHold = false;
    this.actionConsumedThisTick = false;
    this.refreshSprite();
  }

  /** Resets per-tick DOS input side effects before UpdateBart. */
  beginTick(): void { this.actionConsumedThisTick = false; }

  /** True once when UpdateBart consumed FIRE as part of the optional Q+FIRE fast-jump startup. */
  consumeActionRequested(): boolean {
    const consumed = this.actionConsumedThisTick;
    this.actionConsumedThisTick = false;
    return consumed;
  }

  /** Viewer-only damage gate; deliberately separate from DOS 083Dh blinking. */
  setDebugInvulnerable(enabled: boolean): void { this.debugInvulnerable = enabled; }
  isDebugInvulnerable(): boolean { return this.debugInvulnerable; }

  /** Movement/action phase. Collision resolution deliberately happens outside this class. */
  stepMotion(input: BartInputState): void {
    const bart = this.state;
    bart.lastCollision = null;
    this.stepJumpState(input);
    this.stepHorizontal(input);
  }

  /** Animation runs after Bart terrain resolution, matching the original UpdateBart path. */
  finishTick(input: BartInputState, actionActive = false): void {
    this.stepAnimation(input, actionActive);
    this.refreshSprite();
  }

  /**
   * BuildBartRenderObject's recovered invulnerability blink logic:
   *   if 083Dh != 0: --083D; 083C=(083C+1)&7; hide when (083C&4)!=0.
   * A new damage collision occurs after the render-object build in the DOS
   * main loop, so RuntimeWorld calls this before its object-collision pass.
   */
  stepRenderBlink(): void {
    const bart = this.state;
    if (bart.blinkPhase === 0xff) {
      bart.renderVisible = false;
      return;
    }
    if (bart.invulnerabilityTimer === 0) {
      bart.renderVisible = true;
      return;
    }

    bart.invulnerabilityTimer = (bart.invulnerabilityTimer - 1) & 0xff;
    bart.blinkPhase = (bart.blinkPhase + 1) & 0x07;
    bart.renderVisible = (bart.blinkPhase & 0x04) === 0;
  }

  land(y: number, kind: Exclude<BartSupportKind, "none">, sourceIndex: number | null = null, message?: string): void {
    const bart = this.state;
    bart.y = Math.trunc(y);
    bart.supportY = bart.y;
    bart.supportKind = kind;
    bart.supportSourceIndex = sourceIndex;
    bart.velocityY = 0;
    bart.airborne = false;
    bart.jumpHoldCounter = 0;
    this.gravityPhase = false;
    this.forcedJumpHold = false;
    if (message) this.noteCollision(message);
  }

  bounce(velocityY = -0x0580, message = "bounce"): void {
    const bart = this.state;
    bart.velocityY = s16(velocityY);
    bart.airborne = true;
    // Special/negative StaticTerrain landing path: DS:0837=09h. Unlike a
    // normal released jump this is a forced no-gravity hold phase; it does
    // not require Q to remain pressed.
    bart.jumpHoldCounter = 9;
    bart.supportKind = "none";
    bart.supportSourceIndex = null;
    this.gravityPhase = false;
    this.forcedJumpHold = true;
    this.noteCollision(message);
  }

  /**
   * Collision handler 34: force airborne/gravity phase and make the current
   * vertical velocity one pixel/tick more negative, capped by the DOS test at
   * -5.0 px/tick (FB00h). This is deliberately different from terrain spring
   * bounce, which sets a fixed -5.5 velocity.
   */
  bounceUpwardStep(message = "object bounce handler 34"): void {
    const bart = this.state;
    bart.airborne = true;
    bart.jumpHoldCounter = 0;
    bart.supportKind = "none";
    bart.supportSourceIndex = null;
    this.gravityPhase = true;
    this.forcedJumpHold = false;
    if (s16(bart.velocityY) >= -0x0500) {
      bart.velocityY = s16(bart.velocityY - 0x0100);
    }
    this.noteCollision(message);
  }

  /** Handler 3 reflects both Bart velocity components without inventing a snap. */
  reflectVelocity(message: string): void {
    const bart = this.state;
    bart.velocityX = s16(-s16(bart.velocityX));
    bart.velocityY = s16(-s16(bart.velocityY));
    bart.airborne = true;
    bart.supportKind = "none";
    bart.supportSourceIndex = null;
    this.gravityPhase = true;
    this.forcedJumpHold = false;
    this.noteCollision(message);
  }

  loseSupport(message?: string): void {
    const bart = this.state;
    if (bart.airborne) return;
    bart.airborne = true;
    bart.velocityY = 0;
    bart.jumpHoldCounter = 0;
    bart.supportKind = "none";
    bart.supportSourceIndex = null;
    this.gravityPhase = true;
    this.forcedJumpHold = false;
    if (message) this.noteCollision(message);
  }

  /**
   * Recovered damage start: handlers only enter when 083Dh is zero, then
   * BeginBartHitInvulnerability sets 083C=0 / 083D=64h and the handler sets
   * the separate hit/death countdown 083B=32h.
   */
  takeHit(message: string): boolean {
    const bart = this.state;
    if (this.debugInvulnerable || bart.invulnerabilityTimer !== 0 || bart.hitDeathTimer !== 0) return false;
    bart.blinkPhase = 0;
    bart.invulnerabilityTimer = 0x64;
    bart.hitDeathTimer = 0x32;
    bart.renderVisible = true;
    this.noteCollision(message);
    return true;
  }

  grantInvulnerability(ticks: number): void {
    const bart = this.state;
    bart.blinkPhase = 0;
    bart.invulnerabilityTimer = ticks & 0xff;
    bart.renderVisible = true;
  }

  noteCollision(message: string): void {
    this.state.collisionCount++;
    this.state.lastCollision = message;
  }

  private stepHorizontal(input: BartInputState): void {
    const bart = this.state;
    let velocity = s16(bart.velocityX);
    let accelerationStep = 0x20;

    // Recovered input bits: 08h = right, 04h = left.
    if (input.right && !input.left) {
      bart.brakeIdleState = 0;
      bart.facing = 0;
      if (velocity === 0) accelerationStep *= 2;
      if (velocity < 0) bart.animationFrame = 1;
      velocity += accelerationStep;
      if (velocity >= bart.maxSpeedX) velocity = bart.maxSpeedX;
    } else if (input.left && !input.right) {
      bart.brakeIdleState = 0;
      bart.facing = 1;
      if (velocity === 0) accelerationStep *= 2;
      if (velocity >= 0) bart.animationFrame = 1;
      velocity -= accelerationStep;
      if (velocity <= -bart.maxSpeedX) velocity = -bart.maxSpeedX;
    } else {
      if (bart.airborne) {
        accelerationStep = 0x08;
      } else if (bart.brakeIdleState < 4) {
        bart.brakeIdleState++;
        bart.idleTimer = 0;
      } else {
        bart.animationFrame = 0;
        velocity = 0;
      }

      if (velocity < 0) velocity = Math.min(0, velocity + accelerationStep);
      else if (velocity > 0) velocity = Math.max(0, velocity - accelerationStep);
    }

    bart.velocityX = s16(velocity);
    bart.x += wholePixelsTowardZero(bart.velocityX);
    bart.x = Math.max(bart.minX, Math.min(bart.maxX, bart.x));
  }

  stepJumpState(input: BartInputState): void {
    const bart = this.state;

    if (!bart.airborne) {
      // 500Eh..5034h: the grounded jump latch is not simply cleared every
      // frame. Releasing Q resets normal max speed/animation timing.
      if (this.jumpLatch) {
        if (input.jump) return;
        this.jumpLatch = false;
        bart.maxSpeedX = 0x0200;
        bart.animationReload = 3;
        return;
      }

      if (!input.jump) return;
      this.jumpLatch = true;
      bart.airborne = true;
      bart.jumpHoldCounter = 7;
      bart.velocityY = s16(0xfc00); // -4.0 px/tick
      bart.idleTimer = 0;
      bart.supportKind = "none";
      bart.supportSourceIndex = null;
      this.gravityPhase = false;
      this.forcedJumpHold = false;

      // 508Bh..50A2h: FIRE held at jump startup is an OPTIONAL immediate
      // fast-jump path. UpdateBart consumes FIRE before the weapon pass and
      // raises the horizontal cap to 0400h. Normal running does not require
      // FIRE: landing with Q still held selects the same 0400h cap below.
      if (input.action) {
        this.actionConsumedThisTick = true;
        bart.maxSpeedX = 0x0400;
        bart.animationReload = 1;
      }
      return;
    }

    if (!this.gravityPhase && (this.forcedJumpHold || input.jump)) {
      const verticalStep = s8((u16(bart.velocityY) >>> 8) & 0xff);
      bart.y += verticalStep;
      bart.jumpHoldCounter--;
      if (bart.jumpHoldCounter < 0) {
        this.gravityPhase = true;
        this.forcedJumpHold = false;
      }
      return;
    }

    this.gravityPhase = true;
    this.forcedJumpHold = false;
    let velocity = s16(bart.velocityY + 0x70);
    if (velocity > 0x2200) velocity = 0x2200;
    bart.velocityY = velocity;
    bart.y += s8((u16(velocity) >>> 8) & 0xff);

    // 5114h..513Eh: the ordinary base-ground landing is owned by the jump
    // state itself, before UpdateBart performs horizontal acceleration. If Q
    // is still held on that landing tick, DOS enters the 0400h/animation-1
    // run state. O/P is irrelevant to this transition and may be pressed only
    // after takeoff; continuing Q through the landing is the key condition.
    if (bart.y >= bart.groundY) {
      this.land(bart.groundY, "ground");
      this.applyLandingJumpInput(input);
    }
  }

  /**
   * Recovered 4E5Ah/512Eh post-contact Q test. This intentionally only
   * promotes to fast run; the grounded Q-latch path resets to 0200h when Q is
   * later released. Static terrain calls this after its own landing/bounce.
   */
  applyLandingJumpInput(input: BartInputState): void {
    if (!input.jump) return;
    this.state.maxSpeedX = 0x0400;
    this.state.animationReload = 1;
  }

  private stepAnimation(input: BartInputState, actionActive: boolean): void {
    const bart = this.state;

    if (bart.airborne) {
      bart.idleTimer = 0;
      bart.spriteDescriptorId = bart.animationBase + 0x16 + bart.facing;
      return;
    }

    if (bart.brakeIdleState !== 0) {
      if (!input.left && !input.right && !input.jump) bart.idleTimer++;
      else bart.idleTimer = 0;

      if (bart.idleTimer >= 0x1f4 && bart.idleTimer < 0x258) {
        bart.spriteDescriptorId = bart.animationBase + 0x14 + bart.facing;
        return;
      }

      bart.idleAnimCounter = (bart.idleAnimCounter + 2) & 0xff;
      const idleVariant = bart.idleAnimCounter >= 0xf0 ? 1 : 0;
      bart.spriteDescriptorId = bart.animationBase + 0x10 + idleVariant + bart.facing * 2;
      return;
    }

    const sideBase = bart.facing === 0 ? 0 : 8;
    const velocityHigh = s8((u16(bart.velocityX) >>> 8) & 0xff);
    const animate = bart.facing === 0 ? velocityHigh >= 1 : velocityHigh <= -1;

    if (animate) {
      bart.animationTimer = s16(bart.animationTimer - 1);
      if (bart.animationTimer < 0) {
        bart.animationTimer = bart.animationReload;
        bart.animationFrame = (bart.animationFrame + 1) & 7;
      }
    }

    // DOS only applies the extra +18h action offset on the moving-animation
    // path (4F9Ah..4FEBh). Airborne and idle paths return earlier and must
    // never receive it; applying it globally lands in the skateboard frames.
    const actionOffset = bart.animationBase !== 0 && actionActive ? 0x18 : 0;
    bart.spriteDescriptorId = bart.animationBase + sideBase + bart.animationFrame + actionOffset;
  }

  refreshSprite(): void {
    const bart = this.state;
    bart.descriptor = this.level.bartDescriptorByIndex.get(bart.spriteDescriptorId) ?? null;
    bart.image = this.level.bartImageByDescriptorIndex.get(bart.spriteDescriptorId) ?? null;
  }
}
