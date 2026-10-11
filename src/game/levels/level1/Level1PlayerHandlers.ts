import type { BartInputState } from "../../types.js";
import type { LevelPlayerStepEvent, LevelPlayerStepResult, LevelRuntimeServices } from "../LevelHandlers.js";
import type { Level1ShopHandlers } from "./Level1ShopHandlers.js";
import {
  LEVEL1_SKATEBOARD_BOUNDARY_LEFT_SOURCE_OFFSET,
  LEVEL1_SKATEBOARD_BOUNDARY_RIGHT_SOURCE_OFFSET,
  LEVEL1_SKATEBOARD_MAX_X,
  LEVEL1_SKATEBOARD_MIN_X,
} from "./Level1Constants.js";

function u16(value: number): number { return value & 0xffff; }
function s16(value: number): number { const v=value&0xffff; return (v&0x8000)!==0?v-0x10000:v; }
function s8(value: number): number { const v=value&0xff; return (v&0x80)!==0?v-0x100:v; }

/**
 * Level-1 player state outside the object VM.
 *
 * DOS ownership:
 *   LevelSpecificPlayer_Level1       38ECh
 *   UpdateBartSkateboardPhysics      5143h
 *
 * The two direction latches correspond to DS:084C/084D, impulse to 084Eh,
 * animation state to 0850h and skateboard-active to 0852h. Shared Bart
 * globals (velocity/facing/frame timer/idle counter) stay on BartRuntime.
 */
export class Level1PlayerHandlers {
  private skateboardActive = false;
  private rightLatch = false; // DS:084C
  private leftLatch = false;  // DS:084D
  private skateboardImpulse = 0; // DS:084E
  private skateboardAnimState = 0; // DS:0850
  private fractionX = 0; // low-byte accumulator at DS:082C
  private brakeVisual = false; // per-tick role of DS:0853

  constructor(private readonly services: LevelRuntimeServices, private readonly shop: Level1ShopHandlers) {}

  reset(): void {
    this.skateboardActive = false;
    this.rightLatch = false;
    this.leftLatch = false;
    this.skateboardImpulse = 0;
    this.skateboardAnimState = 0;
    this.fractionX = 0;
    this.brakeVisual = false;
  }

  beforePlayerStep(event: LevelPlayerStepEvent): LevelPlayerStepResult {
    const bart = this.services.bart;

    // 38F0h: DS:07F1 is dispatched before every other Level-1 player rule.
    // While nonzero DOS owns Bart through the storefront special sequence,
    // skips the normal Bart update and suppresses the action/weapon routine.
    if (this.shop.active) {
      this.shop.step(event.input);
      return { continueGenericBartUpdate: false, bartActionMode: "suppress-all", suppressInventorySelection: true };
    }

    const inSkateboardZone = bart.x >= LEVEL1_SKATEBOARD_MIN_X && bart.x < LEVEL1_SKATEBOARD_MAX_X;

    if (!inSkateboardZone) {
      if (this.skateboardActive) this.leaveSkateboardMode();
      if (this.shop.tryEnter(event.input)) {
        return { continueGenericBartUpdate: false, bartActionMode: "suppress-all", suppressInventorySelection: true };
      }
      return { continueGenericBartUpdate: true };
    }

    if (!this.skateboardActive) this.enterSkateboardMode();

    // 38ECh calls the shared UpdateBartJumpState before tail-jumping to 5143h,
    // except while grounded FIRE is held. In that case 5143h reuses up/down
    // for the skateboard's 72h..80h vertical lane adjustment.
    if (bart.airborne || !event.input.action) this.services.stepBartJumpState(event.input);

    this.stepSkateboardPhysics(event.input);
    this.services.resolveBartStaticTerrain(event.previousBart, event.input);
    this.stepSkateboardAnimation(event.input);
    this.services.refreshBartSprite();
    return { continueGenericBartUpdate: false, bartActionMode: "suppress-weapons", suppressInventorySelection: true };
  }

  private enterSkateboardMode(): void {
    this.skateboardActive = true; // DOS NOT byte ptr [0852h] from zero -> FFh
    this.rightLatch = false;
    this.leftLatch = false;
    this.skateboardImpulse = 0;
    this.skateboardAnimState = 0;

    // 390Dh..3967h disables both type-61 boundary source records and clears
    // their resident runtime objects if currently loaded.
    this.services.activateSourceRecord(LEVEL1_SKATEBOARD_BOUNDARY_LEFT_SOURCE_OFFSET, 0, "set");
    this.services.activateSourceRecord(LEVEL1_SKATEBOARD_BOUNDARY_RIGHT_SOURCE_OFFSET, 0, "set");
  }

  private leaveSkateboardMode(): void {
    this.skateboardActive = false;
    this.rightLatch = false;
    this.leftLatch = false;
    this.skateboardImpulse = 0;
    this.skateboardAnimState = 0;

    // 397Dh..39A4h restores 8000h on both boundary source records and resets
    // DS:0860 (Bart base-Y clamp) to 7Ah.
    this.services.activateSourceRecord(LEVEL1_SKATEBOARD_BOUNDARY_LEFT_SOURCE_OFFSET, 0x8000, "set");
    this.services.activateSourceRecord(LEVEL1_SKATEBOARD_BOUNDARY_RIGHT_SOURCE_OFFSET, 0x8000, "set");
    this.services.bart.groundY = 0x007a;
  }

  private stepSkateboardPhysics(input: BartInputState): void {
    const bart = this.services.bart;
    let velocity = s16(bart.velocityX);
    this.brakeVisual = false;

    // 5147h: airborne skateboard ticks bypass the grounded input/impulse
    // state machine and enter at the common velocity/integration path 527Ch.
    if (!bart.airborne) {
      if (input.action) {
        if (input.jump && bart.y > 0x72) {
          bart.y--;
          bart.groundY = bart.y;
        } else if (input.down && bart.y < 0x80) {
          bart.y++;
          bart.groundY = bart.y;
        }
      }

      if (velocity === 0) {
        if (this.skateboardAnimState === 0) {
          // 5192h..5215h are edge latches only while stopped. A held key may
          // not repeatedly restart the initial push until it has been released.
          if (this.leftLatch) {
            this.leftLatch = !!input.left;
          } else {
            this.leftLatch = !!input.left;
            if (input.left) {
              bart.facing = 1;
              this.skateboardImpulse = -0x0200;
              this.skateboardAnimState = 1;
            } else if (this.rightLatch) {
              this.rightLatch = !!input.right;
            } else {
              this.rightLatch = !!input.right;
              if (input.right) {
                bart.facing = 0;
                this.skateboardImpulse = 0x0200;
                this.skateboardAnimState = 1;
              }
            }
          }
        }
      } else if (input.left) {
        if (bart.facing === 1) {
          if (this.skateboardAnimState === 0) {
            this.skateboardAnimState = 1;
            this.skateboardImpulse = -0x0200;
          }
        } else {
          this.brakeVisual = true;
          velocity -= 0x10;
          if (velocity < 0) velocity = 0;
        }
      } else {
        this.leftLatch = false;
        if (input.right) {
          if (bart.facing === 0) {
            if (this.skateboardAnimState === 0) {
              this.skateboardAnimState = 1;
              this.skateboardImpulse = 0x0200;
            }
          } else {
            this.brakeVisual = true;
            velocity += 0x10;
            if (velocity > 0) velocity = 0;
          }
        } else {
          this.rightLatch = false;
        }
      }
    }

    // 527Ch: skateboard velocity always drifts two 8.8 units toward zero.
    if (velocity < 0) velocity += 2;
    else if (velocity > 0) velocity -= 2;
    bart.velocityX = s16(velocity);

    // 528Eh..52E9h: signed 8.8 integration via the low-byte accumulator at
    // 082Ch. DOS only permits displacement in the current facing direction;
    // opposite residual motion arms both direction latches instead.
    if (velocity !== 0) {
      const sum = u16(velocity) + (this.fractionX & 0xff);
      this.fractionX = sum & 0xff;
      const deltaX = s8((sum >>> 8) & 0xff);

      if (deltaX < 0) {
        if (bart.facing === 1) bart.x = Math.max(0, bart.x + deltaX);
        else this.armDirectionLatches();
      } else if (deltaX > 0) {
        if (bart.facing === 0) bart.x = Math.min(bart.maxX, 0x30ad, bart.x + deltaX);
        else this.armDirectionLatches();
      }
    }

    // DOS skips its camera correction while the 0850h push animation is
    // active; once idle/riding, default mode keeps Bart in the 88h..98h band.
    if (this.skateboardAnimState === 0) this.stepSkateboardCamera();
  }

  private stepSkateboardCamera(): void {
    const bartX = this.services.bart.x;
    const cameraX = this.services.getCameraWorldX();
    let relative = bartX - cameraX - 0x88;
    if (relative < 0) {
      this.services.setCameraWorldX(cameraX + relative);
      return;
    }
    relative -= 0x10;
    if (relative >= 0) this.services.setCameraWorldX(cameraX + relative);
  }

  private stepSkateboardAnimation(input: BartInputState): void {
    const bart = this.services.bart;
    // 53E8h: spray-can inventory byte DS:0775 switches the complete skateboard
    // descriptor family from 40h to 5Ah; this is availability, not FIRE state.
    const base = (this.services.collisionState.inventoryCounts[3] ?? 0) !== 0 ? 0x5a : 0x40;

    if (bart.airborne) {
      const verticalFrame = s16(bart.velocityY) < 0 ? 0x0b : 0x0c;
      bart.spriteDescriptorId = base + verticalFrame + bart.facing * 0x0d;
      return;
    }

    if (this.skateboardAnimState !== 0) {
      bart.animationTimer = s16(bart.animationTimer - 1);
      if (bart.animationTimer < 0) {
        bart.animationTimer = 2;
        this.skateboardAnimState++;
        if (this.skateboardAnimState >= 9) {
          this.skateboardAnimState = 0;
          return; // 5436h clears 0850h and preserves the prior descriptor this tick.
        }
        if (this.skateboardAnimState === 6) {
          bart.velocityX = Math.max(-0x0800, Math.min(0x0800, s16(bart.velocityX) + this.skateboardImpulse));
        }
      }
      bart.spriteDescriptorId = base + this.skateboardAnimState + bart.facing * 0x0d;
      return;
    }

    let frame = this.brakeVisual ? 0x0a : 0x08;
    const gameplayInput = !!(input.left || input.right || input.jump || input.down || input.action);
    if (!this.brakeVisual && !gameplayInput) {
      bart.idleAnimCounter = (bart.idleAnimCounter + 2) & 0xff;
      if (bart.idleAnimCounter >= 0xf0) frame = 0x09;
    }
    bart.spriteDescriptorId = base + frame + bart.facing * 0x0d;
  }

  private armDirectionLatches(): void {
    this.rightLatch = true;
    this.leftLatch = true;
  }
}
