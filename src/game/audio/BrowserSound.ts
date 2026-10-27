import { readBuzzerAsset } from "./SoundAssets.js";
import { AdlibSynth } from "./AdlibSynth.js";
import { BuzzerDriver, BUZZER_TICK_HZ, PIT_CLOCK_HZ, } from "./BuzzerDriver.js";
/**
 * Browser adapter for the original AdLib and PC-speaker drivers. Gameplay queues
 * IDs; this clock runs independently of the viewer's debug playback speed.
 * AdLib emits synthesized PCM; PC speaker uses a band-limited square wave.
 */
export class BrowserSound {
    private context: AudioContext | null = null;
    private oscillator: OscillatorNode | null = null;
    private gain: GainNode | null = null;
    private driver: BuzzerDriver | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private nextTickTime = 0;
    private adlib: AdlibSynth | null = null;
    private readonly sources = new Set<AudioBufferSourceNode>();
    private playing = true;
    private hidden = false;
    backendLabel = "PC speaker";
    enabled = false;
    /** Must be called by the sound button, so the browser permits audio. */
    async enable(preferred: "adlib" | "buzzer" = "adlib"): Promise<void> {
        this.context ??= new AudioContext();
        // Resume synchronously with the gesture, before the asset fetch can yield.
        await this.context.resume();
        if (preferred === "adlib") {
            const response = await fetch("/data/audio/adlib.json");
            if (response.ok) {
                if (!window.OPL3)
                    throw new Error("OPL synthesizer missing; run npm run build");
                this.adlib = new AdlibSynth(await response.json(), new window.OPL3.OPL3());
                this.backendLabel = "AdLib + music";
                this.enabled = true;
                this.nextTickTime = this.context.currentTime + 0.02;
                this.timer ??= setInterval(() => this.schedule(), 10);
                return;
            }
            if (response.status !== 404)
                throw new Error(`AdLib load failed: HTTP ${response.status}`);
        }
        this.adlib = null;
        this.backendLabel = "PC speaker";
        if (!this.driver) {
            const response = await fetch("/data/audio/pc-speaker.json");
            if (!response.ok)
                throw new Error("Import BUZZER.OVL to pc-speaker.json first: npm run import-sound -- <game-folder>");
            this.driver = new BuzzerDriver(readBuzzerAsset(await response.json()));
        }
        if (!this.oscillator) {
            this.gain = this.context.createGain();
            this.gain.gain.value = 0;
            this.gain.connect(this.context.destination);
            this.oscillator = this.context.createOscillator();
            this.oscillator.type = "square";
            this.oscillator.connect(this.gain);
            this.oscillator.start();
        }
        this.enabled = true;
        this.nextTickTime = this.context.currentTime;
        this.timer ??= setInterval(() => this.schedule(), 10);
    }
    queue(id: number): void {
        if (!this.enabled)
            return;
        if (this.adlib) {
            if (id === 255)
                this.silence();
            else
                this.adlib.driver.queueSound(id);
        }
        else
            this.driver?.queue(id);
    }
    /** Discard scheduled tones on pause, reset, level switch or tab hiding. */
    silence(): void {
        this.driver?.reset();
        for (const source of this.sources) {
            source.stop();
            source.disconnect();
        }
        this.sources.clear();
        if (this.context)
            this.nextTickTime = this.context.currentTime + 0.02;
        if (!this.context || !this.gain || !this.oscillator)
            return;
        const now = this.context.currentTime;
        this.gain.gain.cancelScheduledValues(now);
        this.gain.gain.setValueAtTime(0, now);
        this.oscillator.frequency.cancelScheduledValues(now);
        this.nextTickTime = now;
    }
    setHidden(hidden: boolean): void {
        this.hidden = hidden;
        if (hidden)
            this.silence();
        else if (this.context)
            this.nextTickTime = this.context.currentTime + 0.02;
    }
    setPlaying(playing: boolean): void {
        if (this.playing === playing)
            return;
        this.playing = playing;
        if (!playing)
            this.silence();
        else if (this.context)
            this.nextTickTime = this.context.currentTime + 0.02;
    }
    disable(): void {
        this.enabled = false;
        if (this.timer !== null)
            clearInterval(this.timer);
        this.timer = null;
        this.silence();
        this.adlib = null;
    }
    private schedule(): void {
        if (!this.playing || this.hidden)
            return;
        if (this.enabled && this.context && this.adlib) {
            const now = this.context.currentTime;
            if (this.nextTickTime < now - 0.1)
                this.silence();
            while (this.nextTickTime < now + 0.08) {
                const pcm = this.adlib.renderTick();
                const frames = pcm.length / 2;
                const buffer = this.context.createBuffer(2, frames, AdlibSynth.sampleRate);
                for (let channel = 0; channel < 2; channel++) {
                    const output = buffer.getChannelData(channel);
                    for (let i = 0; i < frames; i++)
                        output[i] = pcm[i * 2 + channel]!;
                }
                const source = this.context.createBufferSource();
                source.buffer = buffer;
                source.connect(this.context.destination);
                source.onended = () => { this.sources.delete(source); source.disconnect(); };
                this.sources.add(source);
                source.start(this.nextTickTime);
                this.nextTickTime += frames / AdlibSynth.sampleRate;
            }
            return;
        }
        if (!this.enabled ||
            !this.context ||
            !this.oscillator ||
            !this.gain ||
            !this.driver)
            return;
        const now = this.context.currentTime;
        // Background throttling must never replay seconds of stale effects.
        if (this.nextTickTime < now - 0.1)
            this.silence();
        while (this.nextTickTime < now + 0.03) {
            const divisor = this.driver.tick();
            const frequency = divisor === null ? 0 : PIT_CLOCK_HZ / (divisor || 65536);
            const audible = frequency > 0 && frequency < this.context.sampleRate / 2;
            this.gain.gain.setValueAtTime(audible ? 0.06 : 0, this.nextTickTime);
            if (audible)
                this.oscillator.frequency.setValueAtTime(frequency, this.nextTickTime);
            this.nextTickTime += 1 / BUZZER_TICK_HZ;
        }
    }
}
