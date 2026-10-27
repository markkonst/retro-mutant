import type { RuntimeWorld } from "../game/RuntimeWorld.js";

export interface DebugPreset {
  id: string;
  label: string;
  description: string;
  /** A fresh scene intentionally discards current Level-1 progress. */
  fresh?: boolean;
}

export const LEVEL1_DEBUG_PRESETS: readonly DebugPreset[] = [
  { id: "nelson", label: "Nelson arena", description: "Fresh scene · goals cleared · face right and FIRE.", fresh: true },
  { id: "maggie-arena", label: "Nelson + Maggie", description: "Fresh scene · six letters · jump into Maggie's ball.", fresh: true },
  { id: "grandpa", label: "Hospital / Grandpa", description: "Fresh scene · 10 rockets, 10 bombs + whistle. Rockets selected; use the whistle for Grandpa.", fresh: true },
  { id: "jebediah", label: "Jebediah rocket", description: "Fresh scene · 10 rockets, positioned for the purple bird.", fresh: true },
  { id: "cinema", label: "Cinema at 400", description: "Fresh scene · spray supplied · timed passer-by.", fresh: true },
  { id: "bomb", label: "Bomb target", description: "Fresh scene · 10 bombs at the recovered target.", fresh: true },
  { id: "phone", label: "Payphone / Moe", description: "Fresh scene · coins selected at the phone.", fresh: true },
  { id: "goals", label: "Clear all goals", description: "Current scene · set goals to zero and remove the end gate." },
  { id: "supplies", label: "Refill test inventory", description: "Current scene · rockets, bombs, spray, coins, wrench, key and whistle." },
  { id: "maggie", label: "Enable Maggie", description: "Current scene · fill six helper letters and enable her source." },
  { id: "time", label: "Restore time / health", description: "Current scene · 999 time, full health and nine lives." },
];

/**
 * Viewer-only test fixture. No game module imports this class.
 * It prepares mutable world state using public APIs; it does not implement
 * story scripts, skip native routines, patch prototypes or call private methods.
 * Scene jumps reset first so used sources, projectiles and boss bounds cannot leak.
 */
export class Level1DebugTools {
  apply(world: RuntimeWorld, id: string): string {
    if (world.level.level !== 1) throw new Error("These story presets require Level 1.");
    const preset = LEVEL1_DEBUG_PRESETS.find(item => item.id === id);
    if (!preset) throw new Error("Unknown debug preset.");
    if (preset.fresh) {
      world.reset();
      this.supplies(world);
    }
    switch (id) {
      case "goals": this.clearGoals(world); break;
      case "supplies": this.supplies(world); break;
      case "maggie": this.enableMaggie(world); break;
      case "time":
        world.hud.levelTimer = 999;
        world.hud.healthCounter = 1;
        world.hud.livesRemaining = 9;
        break;
      case "nelson":
      case "maggie-arena":
        this.clearGoals(world);
        if (id === "maggie-arena") this.enableMaggie(world);
        this.position(world, 0x3140, 122);
        break;
      case "grandpa": this.position(world, 0x2d50, 122, 5); break;
      case "jebediah": this.position(world, 3372 - 117, 122, 5); break;
      case "bomb": this.position(world, 0xb08, 122, 4); break;
      case "phone": this.position(world, 0x348, 0x62, 2); break;
      case "cinema":
        this.position(world, 330, 122, 3);
        world.hud.levelTimer = 400;
        world.hud.timerDivider = 0x23;
        break;
    }
    const message = `Debug: ${preset.label}${preset.fresh ? " (fresh scene)" : ""}`;
    world.hud.lastEvent = message;
    return message;
  }

  private position(world: RuntimeWorld, x: number, y: number, selectedItem = 1): void {
    // Reset already clears the player/controller's internal latches.
    Object.assign(world.bart, {
      x, y, groundY: y, supportY: y, supportKind: "ground",
      supportSourceIndex: null, velocityX: 0, velocityY: 0, airborne: false, facing: 0,
    });
    world.streamCameraX = Math.max(0, x - 0x88);
    world.collisionState.inventory.selectedItem = selectedItem;
  }

  private supplies(world: RuntimeWorld): void {
    // Packed BCD: 10h means ten, not sixteen. Leave inventory selection intact.
    for (const item of [2, 3, 4, 5]) world.collisionState.inventoryCounts[item] = 0x10;
    for (const item of [6, 8, 12]) world.collisionState.inventoryCounts[item] = 1;
    world.collisionState.sprayMeter0815 = 0x1b;
  }

  private clearGoals(world: RuntimeWorld): void {
    world.hud.goalsRemaining = 0;
    const source = world.getSourceStateByOffset(world.level.playerConfig.goal_gate_source_offset);
    if (!source) return;
    source.flags = 0;
    // The gate may already occupy a slot. Remove that live copy too.
    for (const object of world.objects) {
      if (object.active && object.source === source) {
        object.active = false;
        object.vmState = "despawned";
        object.vmWait = null;
      }
    }
  }

  private enableMaggie(world: RuntimeWorld): void {
    world.helperTokensCollected = world.level.playerConfig.helper_token_count ?? 6;
    const source = world.getSourceStateByOffset(world.level.playerConfig.helper_source_offset);
    if (source) source.flags |= 0x8000;
  }
}
