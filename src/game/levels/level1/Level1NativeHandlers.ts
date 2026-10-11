import type { NativeCallResult } from "../../ScriptVm.js";
import type { GameObjectRuntime, ScriptEdge, ScriptInstruction } from "../../types.js";
import type { LevelRuntimeServices } from "../LevelHandlers.js";
import {
  LEVEL1_ACCEL_Y_FROM_BART_DISTANCE,
  LEVEL1_RANDOM_SCRIPT_TABLE,
  LEVEL1_RANDOM_VELOCITY_X,
  LEVEL1_TYPE05_LINK_COUNT,
  LEVEL1_TYPE67_OFFSET,
  LEVEL1_TYPE67_RECORD_OFFSET,
} from "./Level1Constants.js";

function u16(value: number): number { return value & 0xffff; }
function s16(value: number): number { const v = value & 0xffff; return (v & 0x8000) !== 0 ? v - 0x10000 : v; }
function hex(value: number): string { return `0x${u16(value).toString(16).toUpperCase().padStart(4, "0")}`; }

/** Implements the currently recovered 096D:* FAR callbacks. */
export class Level1NativeHandlers {
  private localEventFlag31E5 = 0;

  constructor(private readonly services: LevelRuntimeServices) {}

  reset(): void { this.localEventFlag31E5 = 0; }
  dispose(): void { this.localEventFlag31E5 = 0; }

  handleNativeCall(object: GameObjectRuntime, instruction: ScriptInstruction, edges: ScriptEdge[], nextPc: number): NativeCallResult {
    const name = typeof instruction.args["name"] === "string" ? instruction.args["name"] as string : "";
    switch (name) {
      case "Level1Native_SetObjectFlag1000":
        object.flags = u16(object.flags | 0x1000);
        return { handled: true, targetPc: nextPc, outcome: "native", detail: "flags|=1000h" };
      case "Level1Native_SetObjectLinkField2A": {
        // This native consumes one script word after the FAR-call. The only
        // Level-1 callsite is 096D:2003 and its operand at 2009h is 0064h.
        object.linkField2A = LEVEL1_TYPE05_LINK_COUNT;
        const target = this.edgeTarget(edges, "native_relative_redirect") ?? u16(nextPc + 2);
        return { handled: true, targetPc: target, outcome: "native", detail: `field2A=${object.linkField2A}, SI+=2` };
      }
      case "Level1Native_ToggleFlag1000AndCountdownField2A": {
        object.flags = u16(object.flags ^ 0x1000);
        object.linkField2A = u16(object.linkField2A - 1);
        const complete = object.linkField2A === 0;
        const kind = complete ? "native_relative_redirect" : "native_fallthrough";
        const target = this.edgeTarget(edges, kind) ?? nextPc;
        return { handled: true, targetPc: target, outcome: complete ? "branch-taken" : "fallthrough", detail: `flags^=1000h, field2A=${object.linkField2A}` };
      }
      case "Level1Native_RegisterCurrentObjectAsBoss":
        this.services.collisionState.linkedTargetRuntimeId079D = object.runtimeId;
        return { handled: true, targetPc: nextPc, outcome: "native", detail: `DS:079D -> runtime slot ${object.runtimeId}` };
      case "Level1Native_SetRuntimeFlag0080":
        object.runtimeFlags = u16(object.runtimeFlags | 0x0080);
        return { handled: true, targetPc: nextPc, outcome: "native", detail: "runtimeFlags|=0080h" };
      case "Level1Native_SelectRandomScriptFromTable": {
        const index = this.services.nextRandom() & 7;
        const target = LEVEL1_RANDOM_SCRIPT_TABLE[index]!;
        return { handled: true, targetPc: target, outcome: "branch-taken", detail: `random&7=${index}, table -> ${hex(target)}` };
      }
      case "Level1Native_SetRandomVelocityX": {
        const index = this.services.nextRandom() & 7;
        object.velocityX = s16(LEVEL1_RANDOM_VELOCITY_X[index]!);
        return { handled: true, targetPc: nextPc, outcome: "native", detail: `random&7=${index}, vx=${object.velocityX}` };
      }
      case "Level1Native_SetAccelYFromBartDistance": {
        let index = s16(object.x - this.services.bart.x) >> 5;
        index = Math.max(0, Math.min(7, index));
        object.accelerationY = s16(LEVEL1_ACCEL_Y_FROM_BART_DISTANCE[index]!);
        return { handled: true, targetPc: nextPc, outcome: "native", detail: `distance bucket=${index}, ay=${object.accelerationY}` };
      }
      case "Level1Native_ToggleLevelFinishedFlag": {
        const value = !this.services.getLevelFinished();
        this.services.setLevelFinished(value);
        return { handled: true, targetPc: nextPc, outcome: "native", detail: `levelFinished=${value}` };
      }
      case "Level1Native_SetLocalEventFlag":
        this.localEventFlag31E5 = 1;
        return { handled: true, targetPc: nextPc, outcome: "native", detail: "Level1 local event flag 31E5h=1" };
      case "Level1Native_BranchIfLocalEventFlagSet":
        return this.conditional(edges, nextPc, this.localEventFlag31E5 !== 0, "local event flag 31E5h");
      case "Level1Native_BranchAtTimer400Or200":
        return this.conditional(edges, nextPc, this.services.hud.levelTimer === 400 || this.services.hud.levelTimer === 200, `timer=${this.services.hud.levelTimer}`);
      case "Level1Native_BranchIfType67AtRecord0599":
        return this.conditional(
          edges,
          nextPc,
          this.services.sourceTypeOffset(LEVEL1_TYPE67_RECORD_OFFSET) === LEVEL1_TYPE67_OFFSET,
          `source[0599h].typeOffset=${hex(this.services.sourceTypeOffset(LEVEL1_TYPE67_RECORD_OFFSET) ?? 0xffff)}`,
        );
      case "Level1Native_NelsonChooseAttackOrDeath": {
        if (this.services.collisionState.collisionLatch0784 !== 0) {
          const target = this.edgeTarget(edges, "native_absolute_redirect") ?? 0x23a8;
          return { handled: true, targetPc: target, outcome: "branch-taken", detail: "Nelson defeated -> death script 23A8h" };
        }
        const attack = this.services.nextRandom() & 1;
        const kind = attack ? "native_relative_redirect" : "native_fallthrough";
        const target = this.edgeTarget(edges, kind) ?? nextPc;
        return { handled: true, targetPc: target, outcome: attack ? "branch-taken" : "fallthrough", detail: `Nelson random&1=${attack}` };
      }
      default:
        return { handled: false };
    }
  }

  private edgeTarget(edges: ScriptEdge[], kind: string): number | null {
    return edges.find((edge) => edge.kind === kind)?.to ?? null;
  }

  private conditional(edges: ScriptEdge[], nextPc: number, taken: boolean, label: string): NativeCallResult {
    if (edges.length === 0) return { handled: true, targetPc: nextPc, outcome: taken ? "branch-taken" : "fallthrough", detail: label };
    const preferred = edges.find((edge) => {
      const fallthrough = edge.kind.includes("fallthrough");
      return taken ? !fallthrough : fallthrough;
    }) ?? edges[taken ? Math.min(1, edges.length - 1) : 0]!;
    return { handled: true, targetPc: preferred.to ?? nextPc, outcome: taken ? "branch-taken" : "fallthrough", detail: `${label}: ${taken}` };
  }
}
