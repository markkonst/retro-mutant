/** A decoded BUZZER.OVL record. Delta changes the PIT divisor, not frequency. */
export interface BuzzerTone {
  duration: number;
  divisor: number;
  delta: number;
}
export type BuzzerBank = readonly (readonly BuzzerTone[])[];

// IBM PC timer input clock. VGA:3964 accumulates timer counts until 58ECh.
// This is the nominal service rate; DOS retrace calibration introduces jitter.
export const PIT_CLOCK_HZ = 1193182;
export const BUZZER_TICK_HZ = PIT_CLOCK_HZ / 0x58ec;

/**
 * Read the supported 950-byte raw driver, without executing DOS machine code.
 * All original notes remain in the user's local file, outside source control.
 * Offsets refer to BUZZER's own image, never to SIMPSONS.EXE.
 */
export function decodeBuzzer(bytes: Uint8Array): BuzzerBank {
  if (
    bytes.length !== 950 ||
    bytes[0] !== 0xe8 ||
    bytes[3] !== 0xcb ||
    bytes[4] !== 0xe8 ||
    bytes[7] !== 0xcb
  ) {
    throw new Error(
      "Unsupported BUZZER.OVL: expected the 950-byte DOS driver.",
    );
  }
  const word = (offset: number): number =>
    bytes[offset]! | (bytes[offset + 1]! << 8);
  const bank: BuzzerTone[][] = [];
  for (let id = 0; id < 19; id++) {
    let cursor = word(0x234 + id * 2);
    if (cursor < 0x25a || cursor >= bytes.length)
      throw new Error(`Invalid sound pointer ${id}.`);
    const tones: BuzzerTone[] = [];
    while (true) {
      if (cursor >= bytes.length) throw new Error(`Unterminated sound ${id}.`);
      const duration = bytes[cursor]!;
      if (duration === 0xff) break;
      if (cursor + 2 >= bytes.length) throw new Error(`Truncated sound ${id}.`);
      const deltaByte = bytes[cursor + 1]!;
      const pitchIndex = bytes[cursor + 2]!;
      // 0174h..0233h contains 96 little-endian PIT divisors.
      if (pitchIndex >= 96)
        throw new Error(`Invalid pitch index in sound ${id}.`);
      tones.push({
        duration,
        divisor: word(0x174 + pitchIndex * 2),
        delta: deltaByte < 0x80 ? deltaByte : deltaByte - 0x100,
      });
      cursor += 3;
    }
    bank.push(tones);
  }
  return bank;
}

/**
 * Portable version of BUZZER:009D/00C0. One call is one driver service tick.
 * A new record takes a tick to load (00D5..0105); that tick retains the old
 * hardware pitch. Only subsequent ticks write the divisor and apply delta.
 * null means the inaudible shutdown divisor 000Ah, rendered as silence.
 */
export class BuzzerDriver {
  private pendingId = 0;
  private tones: readonly BuzzerTone[] = [];
  private cursor = 0;
  private remaining = 0;
  private divisor = 0;
  private delta = 0;
  private output: number | null = null;
  private active = false;

  constructor(private readonly bank: BuzzerBank) {}

  /** Mailbox +000A: the latest write wins; zero means no command. */
  queue(id: number): void {
    if (
      !Number.isInteger(id) ||
      (id !== 0xff && (id < 0 || id >= this.bank.length))
    ) {
      throw new RangeError(`Invalid DOS sound ID ${id}.`);
    }
    this.pendingId = id;
  }

  reset(): void {
    this.pendingId = 0;
    this.tones = [];
    this.cursor = 0;
    this.remaining = 0;
    this.output = null;
    this.active = false;
  }

  tick(): number | null {
    if (this.pendingId === 0xff) {
      this.reset(); // browser equivalent of speaker gate off
      return null;
    }
    if (this.pendingId !== 0) {
      this.tones = this.bank[this.pendingId]!;
      this.cursor = 0;
      this.remaining = 0;
      this.active = true;
      this.pendingId = 0;
    }
    if (!this.active) return null;
    if (this.remaining === 0) {
      const tone = this.tones[this.cursor++];
      if (!tone) {
        this.active = false;
        this.output = null;
      } else {
        this.remaining = tone.duration;
        this.divisor = tone.divisor;
        this.delta = tone.delta;
      }
      return this.output;
    }
    this.output = this.divisor;
    this.divisor = (this.divisor + this.delta) & 0xffff;
    this.remaining--;
    return this.output;
  }
}
