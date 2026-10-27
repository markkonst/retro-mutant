import { decodeBuzzer, type BuzzerBank } from "./BuzzerDriver.js";
/** JSON is the playback source. DOS addresses are retained for research. */
export interface BuzzerAsset {
    format: "simpsons-pc-speaker";
    version: 1;
    sounds: {
        id: number;
        dosOffset: number;
        tones: BuzzerBank[number];
    }[];
}
export interface DataField {
    name: string;
    dosOffset: number;
    unit: "byte" | "word";
    values: number[];
}
export interface AdlibAsset {
    format: "simpsons-adlib";
    version: 1;
    description: string;
    fields: DataField[];
}
const word = (b: Uint8Array, p: number): number => b[p]! | b[p + 1]! << 8;
function supported(b: Uint8Array, length: number, name: string): void {
    if (b.length !== length || b[0] !== 232 || b[3] !== 203 || b[4] !== 232 || b[7] !== 203)
        throw new Error(`Unsupported ${name}.OVL`);
}
export function extractBuzzer(bytes: Uint8Array): BuzzerAsset {
    const bank = decodeBuzzer(bytes);
    return { format: "simpsons-pc-speaker", version: 1,
        sounds: bank.map((tones, id) => ({ id, dosOffset: word(bytes, 0x234 + id * 2), tones })) };
}
export function readBuzzerAsset(value: unknown): BuzzerBank {
    const a = value as BuzzerAsset;
    if (a?.format !== "simpsons-pc-speaker" || a.version !== 1 || !Array.isArray(a.sounds) || a.sounds.length !== 19)
        throw new Error("Invalid PC-speaker JSON format/version");
    return a.sounds.map((s, id) => {
        if (s.id !== id || !Array.isArray(s.tones))
            throw new Error("Invalid PC-speaker sound ID/tones");
        return s.tones.map(t => {
            for (const [v, min, max] of [[t.duration, 0, 254], [t.divisor, 0, 65535], [t.delta, -128, 127]])
                if (!Number.isInteger(v) || v! < min! || v! > max!)
                    throw new Error("Invalid PC-speaker tone");
            return { duration: t.duration, divisor: t.divisor, delta: t.delta };
        });
    });
}
/** Extract data fields, never x86 instructions. The addressed field layout lets
 * the proven sequencer retain DOS pointer arithmetic while users edit named
 * instrument parameters, notes, timing, phrase pointers and sound tables.
 * A field's values are authoritative; its name explains the DOS meaning.
 */
export function extractAdlib(bytes: Uint8Array): AdlibAsset {
    supported(bytes, 4077, "ADLIB");
    const fields: DataField[] = [];
    const used = new Set<number>();
    function field(name: string, p: number, count = 1, unit: "byte" | "word" = "byte"): void {
        const width = unit === "word" ? 2 : 1;
        if (p < 0 || p + count * width > bytes.length)
            throw new Error(`Invalid AdLib pointer: ${name}`);
        if (used.has(p))
            return; // Songs can share phrases and effects can share tails.
        const values = Array.from({ length: count }, (_, i) => unit === "word" ? word(bytes, p + i * 2) : bytes[p + i]!);
        for (let i = 0; i < count * width; i++) {
            if (used.has(p + i))
                throw new Error(`Overlapping AdLib fields: ${name}`);
            used.add(p + i);
        }
        fields.push({ name, dosOffset: p, unit, values });
    }
    field("musicCommand", 8, 2);
    field("pendingSoundId", 10);
    field("musicClock", 12);
    field("musicCommandLatch", 24);
    const voiceFields: [
        string,
        number,
        "byte" | "word"
    ][] = [
        ["note", 0, "byte"], ["remainingTicks", 1, "byte"], ["instrumentPointer", 2, "word"],
        ["instrumentIndex", 4, "byte"], ["modulatorRegister", 5, "byte"], ["carrierRegister", 6, "byte"],
        ["channel", 7, "byte"], ["keyOffRegisterAndValue", 8, "word"], ["phraseListPointer", 10, "word"],
        ["eventPointer", 12, "word"], ["carrierVolume", 14, "byte"], ["modulatorVolume", 15, "byte"],
        ["mode", 16, "byte"], ["duration", 17, "byte"], ["transpose", 18, "byte"], ["pitchSlide", 19, "byte"]
    ];
    for (let v = 0; v < 9; v++)
        for (const [name, offset, unit] of voiceFields)
            field(`voice[${v}].${name}`, 0x512 + v * 20 + offset, 1, unit);
    field("volumeAttenuation", 0x5ca, 128);
    field("frequencyWords", 0x64a, 192, "word");
    field("noteOctaves", 0x7ca, 96);
    field("noteFrequencyIndices", 0x82a, 80);
    const instrumentNames = ["modulatorAttackDecay", "carrierAttackDecay", "modulatorSustainRelease", "carrierSustainRelease",
        "modulatorCharacteristics", "carrierCharacteristics", "modulatorWaveform", "carrierWaveform", "transpose", "feedbackConnection",
        "carrierVolume", "modulatorVolume", "keyScaleLevels", "reserved13", "earlyReleaseTicks", "reserved15"];
    for (let i = 0; i < 29; i++)
        instrumentNames.forEach((name, n) => field(`instrument[${i}].${name}`, 0x87a + i * 16 + n));
    field("musicClockDivider", 0xa4a);
    field("musicVoiceCount", 0xa4b, 1, "word");
    field("musicHeaderPointer", 0xa4d, 1, "word");
    field("soundPointers", 0xf19, 19, "word");
    // Stream commands retain their compact byte values, but every note/control
    // gets a name and address. Operands are separate editable fields.
    function sequence(p: number): void {
        for (let limit = 0; limit < 4096; limit++) {
            if (used.has(p))
                return;
            if (p < 0xa4f || p >= bytes.length)
                throw new Error("Invalid AdLib sequence pointer");
            const event = bytes[p]!;
            const controls: Record<number, string> = { 128: "nextPhrase", 129: "rest", 130: "tie", 131: "stopMusic", 132: "transpose", 133: "stopVoice", 134: "slideUp", 135: "slideDown" };
            const name = event < 128 ? "note" : event >= 224 ? "duration (value minus 223 ticks)" : event >= 192 ? "instrument (value minus 192)" : event >= 176 ? "setVolume" : controls[event];
            if (!name)
                throw new Error(`Unknown AdLib event ${event}`);
            field(name, p++);
            if (event === 132 || (event >= 176 && event < 192))
                field("operand", p++);
            if (event === 128 || event === 131 || event === 133)
                return;
        }
        throw new Error("Unterminated AdLib sequence");
    }
    const header = word(bytes, 0xa4d), voices = bytes[header + 1]!;
    if (voices < 1 || voices > 9)
        throw new Error("Invalid AdLib song header");
    field("song.tempoDivider", header);
    field("song.voiceCount", header + 1);
    const lists: number[] = [];
    for (let i = 0; i < voices; i++) {
        field(`song.voice[${i}].phraseList`, header + 2 + i * 2, 1, "word");
        lists.push(word(bytes, header + 2 + i * 2));
    }
    const visited = new Set<number>();
    for (let cursor = 0; cursor < lists.length; cursor++) {
        let p = lists[cursor]!;
        for (let limit = 0; limit < 4096; limit++) {
            if (visited.has(p))
                break;
            visited.add(p);
            if (p < 0xa4f || p + 1 >= bytes.length)
                throw new Error("Invalid phrase list");
            const pointer = word(bytes, p);
            field(pointer ? "phrasePointer" : "repeatMarker", p, 1, "word");
            p += 2;
            if (!pointer) {
                field("repeatListPointer", p, 1, "word");
                lists.push(word(bytes, p));
                break;
            }
            sequence(pointer);
        }
    }
    for (let id = 1; id < 19; id++)
        sequence(word(bytes, 0xf19 + id * 2));
    // Preserve unused data/padding too, but not the driver's executable region.
    // Keeping it explicit makes round-trip comparisons and future research easy.
    for (let p = 0x512; p < bytes.length;) {
        if (used.has(p)) {
            p++;
            continue;
        }
        const start = p;
        while (p < bytes.length && !used.has(p))
            p++;
        field("unclassifiedDataOrPadding", start, p - start);
    }
    fields.sort((a, b) => a.dosOffset - b.dosOffset);
    return { format: "simpsons-adlib", version: 1, description: "Data only: named voices, OPL instruments, pitch tables, song phrase lists and note/control streams. Values are original bytes or little-endian words; addresses are decimal DOS offsets. No x86 code.", fields };
}
/** Validate before constructing the private working memory. No OVL is fetched. */
export function readAdlibAsset(value: unknown): Uint8Array {
    const a = value as AdlibAsset;
    if (a?.format !== "simpsons-adlib" || a.version !== 1 || !Array.isArray(a.fields))
        throw new Error("Invalid AdLib JSON format/version");
    const memory = new Uint8Array(65536), used = new Set<number>();
    for (const f of a.fields) {
        if (!Number.isInteger(f.dosOffset) || !Array.isArray(f.values) || !f.values.length || !['byte', 'word'].includes(f.unit))
            throw new Error("Invalid AdLib field");
        let p = f.dosOffset;
        for (const v of f.values) {
            const width = f.unit === 'word' ? 2 : 1;
            if (!Number.isInteger(v) || v < 0 || v > (width === 2 ? 65535 : 255))
                throw new Error("Invalid AdLib field value");
            for (let n = 0; n < width; n++, p++) {
                if (!(p === 8 || p === 9 || p === 10 || p === 12 || p === 24 || (p >= 0x512 && p < 4077)) || used.has(p))
                    throw new Error("Invalid/overlapping AdLib data address");
                memory[p] = (v >>> (n * 8)) & 255;
                used.add(p);
            }
        }
    }
    for (let p = 0x512; p < 4077; p++)
        if (!used.has(p))
            throw new Error("Incomplete AdLib JSON data");
    for (const p of [8, 9, 10, 12, 24])
        if (!used.has(p))
            throw new Error("Missing AdLib initial state");
    return memory;
}
