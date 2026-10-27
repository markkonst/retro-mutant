import { readAdlibAsset } from "./SoundAssets.js";
/** OPL register writes emitted by the recovered ADLIB.OVL sequencer. */
export type OplWrite = (register: number, value: number) => void;
/**
 * Translation of ADLIB:003D..047A, independent of the synthesizer/browser.
 * Music uses a divided clock; effects use every service tick. Nine voices
 * share the hardware. Effects take the highest free voice and remain pending
 * if every voice is busy. Original instruments and songs come from the extracted JSON.
 * Memory offsets are kept here so the translation can be compared to x86.
 *
 * Each 20-byte voice at 0512h contains: note (+0), remaining ticks (+1),
 * instrument pointer (+2), operator/channel registers (+5..9), phrase-list
 * pointer (+10), next event pointer (+12), volumes (+14..15), voice mode
 * (+16: 0=free, 1=music, 2=effect), note duration (+17), transpose (+18),
 * and pitch-slide increment (+19). Words are little-endian.
 *
 * A voice is one hardware tone channel. An instrument describes how its two
 * FM operators shape that tone. A phrase is a sequence of notes and controls;
 * the song is a list of phrase pointers, allowing repeated musical sections.
 */
export class AdlibDriver {
    readonly memory = new Uint8Array(65536);
    constructor(asset: unknown, private readonly output: OplWrite) {
        this.memory.set(readAdlibAsset(asset));
    }
    private read(address: number): number { return this.memory[address & 65535]!; }
    private word(address: number): number { return this.read(address) | this.read(address + 1) << 8; }
    private put(address: number, value: number): void { this.memory[address & 65535] = value & 255; }
    private putWord(address: number, value: number): void { this.put(address, value); this.put(address + 1, value >> 8); }
    private write(register: number, value: number): void { this.output(register & 255, value & 255); }
    private keyOff(voice: number): void { this.write(this.read(voice + 8), this.read(voice + 9)); }
    /** VGA clears AH before writing the whole music mailbox word. */
    queueMusic(command: 1 | 255): void { this.putWord(8, command); }
    queueSound(id: number): void {
        if (!Number.isInteger(id) || id < 0 || id > 18)
            throw new RangeError(`Invalid AdLib SFX ${id}`);
        this.put(10, id);
    }
    tick(): void {
        this.musicCommand();
        const sound = this.read(10);
        if (sound) {
            for (let v = 0x5b2; v >= 0x512; v -= 20) {
                if (this.read(v + 16) !== 0)
                    continue;
                this.put(10, 0);
                this.put(v + 16, 2);
                this.put(v + 19, 0);
                this.events(v, this.word(0xf19 + sound * 2));
                break;
            }
        }
        this.put(12, this.read(12) - 1);
        for (let v = 0x512; v <= 0x5b2; v += 20) {
            const mode = this.read(v + 16);
            if (!mode || (mode !== 2 && this.read(12) !== 0))
                continue;
            this.put(v + 1, this.read(v + 1) - 1);
            if (this.read(v + 1) === 0)
                this.events(v, this.word(v + 12));
            else {
                if (this.read(v + 19)) {
                    this.put(v, this.read(v) + this.read(v + 19));
                    this.pitch(v);
                }
                // 02F7h: release early unless the following event is a tie (82h).
                if (this.read(this.word(v + 12)) !== 0x82 && this.read(this.word(v + 2) + 14) === this.read(v + 1)) {
                    this.keyOff(v);
                    this.put(v + 19, 0);
                }
            }
        }
        if (!this.read(12))
            this.put(12, this.read(0xa4a));
    }
    private stopMusic(): void {
        const count = this.word(0xa4b);
        if (count > 9)
            throw new Error("Invalid AdLib music voice count");
        for (let v = 0x512; v < 0x512 + count * 20; v += 20) {
            this.keyOff(v);
            this.put(v + 16, 0);
        }
        this.putWord(8, 0);
    }
    private musicCommand(): void {
        const command = this.read(8);
        if (this.read(9) === 0)
            this.put(24, command);
        if (!this.read(24))
            return;
        this.put(8, 0);
        this.put(24, 0);
        if (command >= 4) {
            this.stopMusic();
            return;
        }
        if (command !== 1)
            throw new Error("Unsupported AdLib music selection");
        this.put(9, command);
        let cursor = this.word(0xa4b + command * 2);
        for (let v = 0x512; v <= 0x5b2; v += 20)
            this.put(v + 16, 0);
        this.put(0xa4a, this.read(cursor++));
        const count = this.read(cursor++);
        if (count < 1 || count > 9)
            throw new Error("Invalid AdLib music header");
        this.putWord(0xa4b, count);
        for (let v = 0x512; v < 0x512 + count * 20; v += 20) {
            const list = this.word(cursor);
            cursor += 2;
            this.putWord(v + 10, list + 2);
            this.putWord(v + 12, this.word(list));
            this.put(v + 1, 1);
            this.put(v + 16, 1);
        }
        for (let v = 0x512; v <= 0x5b2; v += 20)
            this.keyOff(v);
        this.write(1, 0x20);
        this.write(0xbd, 0xc0);
        this.write(8, 0);
        this.write(4, 0x21);
        this.put(12, 1);
    }
    private events(v: number, cursor: number): void {
        // Bound malformed control-only loops without changing legitimate waits.
        for (let count = 0; count < 1024; count++) {
            const event = this.read(cursor++);
            if (event < 0x80) {
                this.put(v, event);
                this.keyOff(v);
                this.pitch(v);
                this.finishEvent(v, cursor);
                return;
            }
            if (event >= 0xe0) {
                this.put(v + 17, event - 0xdf);
                continue;
            }
            if (event >= 0xc0) {
                this.instrument(v, event - 0xc0);
                continue;
            }
            if (event >= 0xb0) {
                this.put(v + 14, this.read(cursor++));
                this.volume(v);
                continue;
            }
            switch (event) {
                case 0x80: {
                    // End of phrase: read the next phrase pointer. Zero introduces a
                    // pointer to a new phrase list (the song's repeat mechanism).
                    let list = this.word(v + 10);
                    let next = this.word(list);
                    list += 2;
                    if (!next) {
                        list = this.word(list);
                        next = this.word(list);
                        list += 2;
                    }
                    this.putWord(v + 10, list);
                    this.putWord(v + 12, next);
                    cursor = next;
                    break;
                }
                case 0x81:
                    this.keyOff(v);
                    this.finishEvent(v, cursor);
                    return;
                case 0x82:
                    this.finishEvent(v, cursor);
                    return;
                case 0x83:
                    this.stopMusic();
                    return;
                case 0x84:
                    this.put(v + 18, this.read(cursor++));
                    break;
                case 0x85:
                    this.keyOff(v);
                    this.put(v + 16, 0);
                    return;
                case 0x86:
                    this.put(v + 19, 1);
                    break;
                case 0x87:
                    this.put(v + 19, 255);
                    break;
                default: throw new Error(`Unknown AdLib control ${event.toString(16)}`);
            }
        }
        throw new Error("AdLib control loop exceeded safety limit");
    }
    private finishEvent(v: number, cursor: number): void {
        this.putWord(v + 12, cursor);
        this.put(v + 1, this.read(v + 17));
    }
    private instrument(v: number, index: number): void {
        const descriptor = 0x87a + index * 16;
        this.put(v + 4, index);
        this.putWord(v + 2, descriptor);
        const first = this.read(v + 5), second = this.read(v + 6);
        for (const [base, offset] of [[0x60, 0], [0x80, 2], [0xe0, 6]] as const) {
            this.write(base + first, this.read(descriptor + offset));
            this.write(base + second, this.read(descriptor + offset + 1));
        }
        this.write(0xc0 + this.read(v + 7), this.read(descriptor + 9));
        this.write(0x20 + first, this.read(descriptor + 4));
        this.write(0x20 + second, this.read(descriptor + 5));
        this.put(v + 14, this.read(descriptor + 10));
        this.put(v + 15, this.read(descriptor + 11));
        this.volume(v);
        this.put(v + 18, this.read(descriptor + 8));
    }
    private volume(v: number): void {
        const scale = this.read(this.word(v + 2) + 12);
        this.write(0x40 + this.read(v + 6), this.read(0x5ca + (this.read(v + 14) & 127)) | ((scale << 2) & 0xc0));
        this.write(0x40 + this.read(v + 5), this.read(0x5ca + (this.read(v + 15) & 127)) | ((scale << 6) & 0xc0));
    }
    private pitch(v: number): void {
        const note = (this.read(v) + this.read(v + 18)) & 255;
        let block = (this.read(0x7ca + note) - 1) & 255;
        // The four AL shifts wrap before the final AX shift in the x86 routine.
        const offset = ((this.read(0x82a + note) << 4) & 255) * 2;
        let frequency = this.word(0x64a + offset);
        if (frequency & 0x8000)
            block = (block + 1) & 255;
        if (block & 0x80) {
            block = (block + 1) & 255;
            frequency = ((frequency & 0x8000 ? frequency - 65536 : frequency) >> 1) & 65535;
        }
        const channel = this.read(v + 7);
        this.write(0xa0 + channel, frequency);
        const high = ((frequency >> 8) & 3) | ((block << 2) & 255);
        this.putWord(v + 8, (0xb0 + channel) | (high << 8));
        this.write(0xb0 + channel, high | 32);
    }
}
