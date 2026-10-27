import { AdlibDriver } from "./AdlibDriver.js";
import { BUZZER_TICK_HZ } from "./BuzzerDriver.js";
export interface OplChip {
    write(bank: number, register: number, value: number): void;
    read(output: Float32Array): Float32Array;
}
export type OplFactory = () => OplChip;
declare global {
    interface Window {
        OPL3?: {
            OPL3: new () => OplChip;
        };
    }
}
/** Convert each original driver tick to stereo PCM at the chip's native rate.
 * The external OPL implementation models the chip; our code models the game
 * driver. Keeping them separate lets tests compare driver writes against x86.
 */
export class AdlibSynth {
    static readonly sampleRate = 49700;
    readonly driver: AdlibDriver;
    private sampleRemainder = 0;
    constructor(asset: unknown, private readonly chip: OplChip) {
        this.driver = new AdlibDriver(asset, (register, value) => chip.write(0, register, value));
        this.driver.queueMusic(1);
    }
    renderTick(): Float32Array {
        this.driver.tick();
        this.sampleRemainder += AdlibSynth.sampleRate / BUZZER_TICK_HZ;
        const frames = Math.floor(this.sampleRemainder);
        this.sampleRemainder -= frames;
        return this.chip.read(new Float32Array(frames * 2));
    }
}
