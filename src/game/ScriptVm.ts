import {
  GameObjectRuntime,
  ScriptEdge,
  ScriptInstruction,
  VmHistoryEntry,
  VmInstructionRuntimeState,
} from "./types.js";

export interface VmRunResult {
  yielded: boolean;
  despawned: boolean;
  blocked: boolean;
}

export interface NativeCallResult {
  handled: boolean;
  targetPc?: number;
  outcome?: string;
  detail?: string;
}

export interface ScriptVmEffects {
  decrementObjectiveCounter(): void;
  getBartX(): number;
  detachSource(object: GameObjectRuntime): void;
  despawnObject(object: GameObjectRuntime, reason: string): void;
  persistObjectY(object: GameObjectRuntime): void;
  updateSourceTypeFlags(object: GameObjectRuntime, typeOffset: number, flags: number): void;
  onObjectTypeChanged(object: GameObjectRuntime): void;
  setGlobalEventData(object: GameObjectRuntime, words: number[]): void;
  spawnChild(parent: GameObjectRuntime, instruction: ScriptInstruction, afterCurrent: boolean): boolean;
  callNative(object: GameObjectRuntime, instruction: ScriptInstruction, edges: ScriptEdge[], nextPc: number): NativeCallResult;
  setLevelCameraState(object: GameObjectRuntime, mode: number, target: number): void;
  setObjectSpecialRenderBytes(object: GameObjectRuntime, bytes: [number, number, number]): void;
}

function u16(value: number): number { return value & 0xffff; }
function s16(value: number): number {
  const v = value & 0xffff;
  return (v & 0x8000) !== 0 ? v - 0x10000 : v;
}

function numberArg(instruction: ScriptInstruction, key: string): number {
  const value = instruction.args[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${instruction.name} @ ${instruction.pc_hex}: missing numeric arg '${key}'`);
  }
  return value;
}

const SAFE_VISUAL_NOOPS = new Set<string>([
  "SetGlobalRange",
  "SetGlobalTargets",
]);

const BOUNCE_Y = [0x0000, 0xfb00, 0xfc00, 0xfd00, 0xfe00, 0xff00];

export class ScriptVm {
  constructor(private readonly effects: Partial<ScriptVmEffects> = {}) {}

  runUntilYield(object: GameObjectRuntime, tick = 0, maxInstructions = 512): VmRunResult {
    if (!object.active || object.vmState === "despawned") {
      return { yielded: false, despawned: true, blocked: false };
    }
    if (object.vmState === "blocked") {
      return { yielded: false, despawned: false, blocked: true };
    }
    if (!object.flow) {
      this.block(object, tick, null, "No decoded script flow exists for this object type.");
      return { yielded: false, despawned: false, blocked: true };
    }

    if (object.vmWait && object.scriptPC !== object.vmWait.originPc && s16(object.scriptDelay) < 0) {
      object.vmWait = null;
    }

    const instructionByPc = new Map<number, ScriptInstruction>(
      object.flow.instructions.map((instruction) => [instruction.pc, instruction]),
    );
    const edgesByPc = new Map<number, ScriptEdge[]>();
    for (const edge of object.flow.edges) {
      const list = edgesByPc.get(edge.from) ?? [];
      list.push(edge);
      edgesByPc.set(edge.from, list);
    }

    for (let count = 0; count < maxInstructions; count++) {
      const instruction = instructionByPc.get(object.scriptPC);
      if (!instruction) {
        this.block(object, tick, null, `No decoded instruction at PC 0x${object.scriptPC.toString(16).toUpperCase().padStart(4, "0")}.`);
        return { yielded: false, despawned: false, blocked: true };
      }

      object.lastInstructionPc = instruction.pc;
      object.lastInstructionName = instruction.name;
      object.instructionsExecuted++;
      const nextPc = u16(instruction.pc + instruction.size);

      switch (instruction.name) {
        case "Wait": {
          const ticks = u16(numberArg(instruction, "ticks"));
          object.scriptDelay = ticks;
          object.scriptPC = nextPc;
          object.vmWait = {
            originPc: instruction.pc, resumePc: nextPc, reason: "delay", startedAtTick: tick,
            initialDelay: ticks, threshold: null, detail: `Wait ${ticks} ticks`,
          };
          this.trace(object, instruction, tick, "waiting", `delay=${ticks}, resume=${this.hex(nextPc)}`);
          return { yielded: true, despawned: false, blocked: false };
        }

        case "SetAnimation":
          object.descriptorBank = "object";
          object.animBase = u16(numberArg(instruction, "anim_base"));
          object.animFrameCount = u16(numberArg(instruction, "frame_count"));
          object.animTimer = u16(numberArg(instruction, "reload_ticks"));
          object.animReload = object.animTimer;
          object.animFrame = 0;
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `base=${this.hex(object.animBase)} frames=${object.animFrameCount}`);
          break;

        case "SetStaticFrame": {
          const animBase = u16(numberArg(instruction, "anim_base"));
          object.descriptorBank = (animBase % 12) === 0 ? "object" : "bart";
          object.animBase = animBase;
          object.animFrameCount = 1;
          object.animTimer = 1;
          object.animReload = 0xffff;
          object.animFrame = 0;
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `frame-base=${this.hex(animBase)}`);
          break;
        }

        case "Goto": {
          const target = u16(numberArg(instruction, "target"));
          object.scriptPC = target;
          object.vmLastBranch = { pc: instruction.pc, tick, kind: "goto", targetPc: target, detail: null };
          this.trace(object, instruction, tick, "branch-taken", `→ ${this.hex(target)}`);
          break;
        }

        case "PlaySound":
          object.lastSoundId = u16(numberArg(instruction, "sound_id"));
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `sound=${this.hex(object.lastSoundId, 2)}`);
          break;

        case "SetVelocityX": {
          const raw = u16(numberArg(instruction, "fixed_8_8_raw"));
          object.velocityX = s16(raw);
          object.fractionX = raw & 0xff;
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `vx=${s16(raw)}`);
          break;
        }

        case "SetVelocityY": {
          const raw = u16(numberArg(instruction, "fixed_8_8_raw"));
          object.velocityY = s16(raw);
          object.fractionY = raw & 0xff;
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `vy=${s16(raw)}`);
          break;
        }

        case "SetAccelerationX":
          object.accelerationX = s16(numberArg(instruction, "fixed_8_8_raw"));
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `ax=${object.accelerationX}`);
          break;

        case "SetAccelerationY":
          object.accelerationY = s16(numberArg(instruction, "fixed_8_8_raw"));
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `ay=${object.accelerationY}`);
          break;

        case "StopMotion":
          object.velocityX = 0; object.velocityY = 0; object.accelerationX = 0; object.accelerationY = 0;
          object.fractionX = 0; object.fractionY = 0; object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", "motion cleared");
          break;

        case "DetachSource":
          this.effects.detachSource?.(object);
          object.sourceAttached = false;
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", "persistent source detached/disabled");
          break;

        case "SetTypeAndPersistY":
          object.typeOffset = u16(numberArg(instruction, "type_offset"));
          object.typeId = object.typeOffset >>> 1;
          this.effects.onObjectTypeChanged?.(object);
          this.effects.persistObjectY?.(object);
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `type=${object.typeId}, persisted Y=${object.y}`);
          break;

        case "WaitUntilYAtLeast": {
          const threshold = s16(numberArg(instruction, "y_threshold"));
          if (object.y < threshold) {
            object.scriptDelay = 0;
            object.scriptPC = instruction.pc;
            object.vmWait = {
              originPc: instruction.pc, resumePc: nextPc, reason: "condition", startedAtTick: object.vmWait?.originPc === instruction.pc ? object.vmWait.startedAtTick : tick,
              initialDelay: null, threshold, detail: `Y ${object.y} < ${threshold}`,
            };
            this.trace(object, instruction, tick, "waiting", `Y ${object.y} < ${threshold}`);
            return { yielded: true, despawned: false, blocked: false };
          }
          object.vmWait = null;
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "condition-met", `Y ${object.y} >= ${threshold}`);
          break;
        }

        case "SetObjectFlag1000":
          object.flags = u16(object.flags | 0x1000); object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", "flags|=1000h");
          break;

        case "ClearObjectFlag1000":
          object.flags = u16(object.flags & ~0x1000); object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", "flags&=~1000h");
          break;

        case "SetSourceTypeFlags": {
          const typeOffset = u16(numberArg(instruction, "type_offset"));
          const flags = u16(numberArg(instruction, "flags"));
          this.effects.updateSourceTypeFlags?.(object, typeOffset, flags);
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", `source type=${typeOffset >>> 1} flags=${this.hex(flags)}`);
          break;
        }

        case "SetGlobalEventData": {
          const rawWords = instruction.args["words"];
          const words = Array.isArray(rawWords) ? rawWords.filter((v): v is number => typeof v === "number").map(u16) : [];
          this.effects.setGlobalEventData?.(object, words);
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", words.length >= 3 ? `event=${this.hex(words[2]!)}:${this.hex(words[1]!)}` : "event data copied");
          break;
        }

        case "TriggerGlobalEventSound4":
          object.lastSoundId = 4; object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", "sound=04h");
          break;

        case "DecrementObjectiveCounterBCD":
          this.effects.decrementObjectiveCounter?.();
          object.vmNote = "DecrementObjectiveCounterBCD updated the live HUD goal counter.";
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "executed", "goals--");
          break;

        case "GotoIfXAtOrRightOfBart": {
          const target = u16(numberArg(instruction, "target"));
          const bartX = this.effects.getBartX?.() ?? 0;
          const taken = u16(object.x) >= u16(bartX);
          object.scriptPC = taken ? target : nextPc;
          object.vmLastBranch = { pc: instruction.pc, tick, kind: taken ? "branch-taken" : "fallthrough", targetPc: object.scriptPC, detail: `objectX=${object.x}, BartX=${bartX}` };
          this.trace(object, instruction, tick, taken ? "branch-taken" : "fallthrough", `objectX=${object.x} BartX=${bartX} → ${this.hex(object.scriptPC)}`);
          break;
        }

        case "SpawnChild":
        case "SpawnChildAfterCurrent": {
          const afterCurrent = instruction.name === "SpawnChildAfterCurrent";
          const spawned = this.effects.spawnChild?.(object, instruction, afterCurrent) ?? false;
          if (!spawned && !afterCurrent) {
            object.scriptDelay = 0;
            object.scriptPC = instruction.pc;
            object.vmWait = {
              originPc: instruction.pc, resumePc: nextPc, reason: "runtime-slot", startedAtTick: object.vmWait?.originPc === instruction.pc ? object.vmWait.startedAtTick : tick,
              initialDelay: null, threshold: null, detail: "No free DOS runtime slot; SpawnChild retries next tick.",
            };
            this.trace(object, instruction, tick, "waiting", "no free runtime slot; retry");
            return { yielded: true, despawned: false, blocked: false };
          }
          object.vmWait = null;
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, spawned ? "spawned" : "spawn-skipped", afterCurrent ? "after-current allocation" : "pool allocation");
          break;
        }

        case "BounceSlowdownStep": {
          object.flags = u16(object.flags + 2);
          const index = (object.flags & 0x0f) >>> 1;
          object.velocityY = s16(BOUNCE_Y[Math.min(index, BOUNCE_Y.length - 1)] ?? 0);
          object.scriptDelay = 2;
          if (object.velocityX > 0) object.velocityX = s16(object.velocityX - 0x40);
          else if (object.velocityX < 0) object.velocityX = s16(object.velocityX + 0x40);
          object.scriptPC = nextPc;
          object.vmWait = { originPc: instruction.pc, resumePc: nextPc, reason: "delay", startedAtTick: tick, initialDelay: 2, threshold: null, detail: `bounce index=${index}` };
          this.trace(object, instruction, tick, "waiting", `bounce index=${index}, vy=${object.velocityY}`);
          return { yielded: true, despawned: false, blocked: false };
        }

        case "ExternalSpecial3Bytes": {
          const raw = instruction.args["bytes"];
          if (!Array.isArray(raw) || raw.length < 3 || raw.slice(0, 3).some((v) => typeof v !== "number")) {
            throw new Error(`${instruction.name} @ ${instruction.pc_hex}: missing three-byte operand`);
          }
          const bytes: [number, number, number] = [u16(raw[0] as number) & 0xff, u16(raw[1] as number) & 0xff, u16(raw[2] as number) & 0xff];
          this.effects.setObjectSpecialRenderBytes?.(object, bytes);
          object.scriptPC = nextPc;
          this.trace(object, instruction, tick, "render-special", bytes.map((v) => v.toString(16).toUpperCase().padStart(2, "0")).join(" "));
          break;
        }

        case "SetLevelCameraState": {
          const mode = numberArg(instruction, "mode");
          const target = numberArg(instruction, "target");
          this.effects.setLevelCameraState?.(object, mode, target);
          object.scriptPC = nextPc;
          object.vmNote = `camera mode=${mode}, target=${this.hex(target)}`;
          this.trace(object, instruction, tick, "camera-state", object.vmNote);
          break;
        }

        case "Despawn":
          this.trace(object, instruction, tick, "despawned", null);
          this.effects.despawnObject?.(object, "Despawn executed.");
          object.active = false; object.vmState = "despawned"; object.vmMessage = "Despawn executed.";
          return { yielded: false, despawned: true, blocked: false };

        case "CallNativeFar": {
          const edges = (edgesByPc.get(instruction.pc) ?? []).filter((edge) => edge.to !== null);
          const native = this.effects.callNative?.(object, instruction, edges, nextPc);
          if (native?.handled) {
            object.scriptPC = u16(native.targetPc ?? nextPc);
            object.vmLastBranch = { pc: instruction.pc, tick, kind: native.outcome ?? "native", targetPc: object.scriptPC, detail: native.detail ?? null };
            object.vmNote = native.detail ?? null;
            this.trace(object, instruction, tick, native.outcome ?? "native", `${native.detail ?? "handled"} → ${this.hex(object.scriptPC)}`);
            break;
          }
          if (edges.length === 1) {
            const edge = edges[0]!;
            object.scriptPC = edge.to ?? nextPc;
            const nativeName = instruction.args["name"];
            object.vmNote = `Native bypassed via deterministic ${edge.kind}: ${typeof nativeName === "string" ? nativeName : "unknown native"}`;
            object.vmLastBranch = { pc: instruction.pc, tick, kind: edge.kind, targetPc: object.scriptPC, detail: object.vmNote };
            this.trace(object, instruction, tick, "native-deterministic", `${object.vmNote} → ${this.hex(object.scriptPC)}`);
            break;
          }
          this.block(object, tick, instruction, `Native FAR call has ${edges.length} possible CFG continuations; runtime choice is not implemented.`);
          return { yielded: false, despawned: false, blocked: true };
        }

        default:
          if (SAFE_VISUAL_NOOPS.has(instruction.name)) {
            object.vmNote = `${instruction.name} executed as a viewer no-op (platform/global side effect not required by current rendering).`;
            object.scriptPC = nextPc;
            this.trace(object, instruction, tick, "viewer-noop", object.vmNote);
            break;
          }
          this.block(object, tick, instruction, `Unsupported VM instruction '${instruction.name}' at ${instruction.pc_hex}.`);
          return { yielded: false, despawned: false, blocked: true };
      }
    }

    this.block(object, tick, null, `Instruction budget (${maxInstructions}) exhausted without a yield.`);
    return { yielded: false, despawned: false, blocked: true };
  }

  private trace(object: GameObjectRuntime, instruction: ScriptInstruction, tick: number, outcome: string, detail: string | null): void {
    const previous = object.vmInstructionStates.get(instruction.pc);
    const state: VmInstructionRuntimeState = {
      visits: (previous?.visits ?? 0) + 1,
      lastTick: tick,
      lastOutcome: outcome,
      lastDetail: detail,
    };
    object.vmInstructionStates.set(instruction.pc, state);
    const entry: VmHistoryEntry = { tick, pc: instruction.pc, name: instruction.name, outcome, detail };
    object.vmHistory.push(entry);
    if (object.vmHistory.length > 64) object.vmHistory.splice(0, object.vmHistory.length - 64);
  }

  private block(object: GameObjectRuntime, tick: number, instruction: ScriptInstruction | null, message: string): void {
    object.vmState = "blocked";
    object.vmMessage = message;
    if (instruction) this.trace(object, instruction, tick, "blocked", message);
  }

  private hex(value: number, width = 4): string {
    return `0x${u16(value).toString(16).toUpperCase().padStart(width, "0")}`;
  }
}
