# Audio: PC speaker and AdLib

[Documentation home](../README.md) · [Asset pipeline](../assets/README.md)

Audio is generated from commands and instrument data, not recorded WAV files. The game requests a sound ID; the selected driver interprets that request on its own timer. This chapter covers only sound. Level events that request sounds belong in the [level chapters](../levels/README.md).

## Play the original music and sound effects

Supply your original DOS files as usual, then run:

```powershell
npm run import-sound -- "C:/path/to/SIMPSONS"
npm run dev
```

Choose **AdLib** (music and FM effects) or **PC speaker**, then click
**Sound: off** to enable audio. The button shows the active backend.
The browser requires this user gesture. Missing or unsupported files produce
an actionable message; they do not stop the game. Pause, reset, level changes,
muting and hiding the tab stop scheduled sound. AdLib music resumes from its
sequencer position after pausing; disabling and enabling audio restarts it.

The importer reads your 950-byte `BUZZER.OVL` and optional 4077-byte
`ADLIB.OVL`, then writes **pc-speaker.json** and **adlib.json** to ignored
`wwwroot/data/audio`. The browser fetches only these JSON files. Existing OVL
copies from earlier imports may remain on disk, but playback no longer uses them.
Original notes and instruments remain local extracted assets, outside Git.

### Reading and editing the JSON

Both formats have a `format` identifier and `version: 1`. Unknown versions are
rejected. Re-run `npm run import-sound -- <game-folder>` to regenerate them;
this replaces local JSON edits.

- **pc-speaker.json** has 19 sounds with numeric `id`, original `dosOffset`
  and `tones`. Each tone has `duration` in service ticks, initial PIT `divisor`
  and signed `delta` added to the divisor each output tick. Lower divisors mean
  higher pitch; the separate record-loading tick is preserved by the driver.
- **adlib.json** contains named `fields`, each with `dosOffset`, `unit` (`byte`
  or little-endian `word`) and authoritative numeric `values`. Names identify
  nine voice records, 29 instrument records, pitch/volume tables, music header,
  phrase/repeat pointers, and individual note/control commands with operands.
  For example, `instrument[0].carrierVolume` is an editable instrument field.
  Addresses are decimal: 2170 corresponds to DOS `087Ah`.
- AdLib stream values preserve the compact original encoding. A `note` value
  is a driver note index, not a MIDI note number. An `instrument` command stores
  index + 192; a `duration` command stores ticks + 223. Command names explain
  these conversions. A following `operand` belongs to the preceding command.
- `unclassifiedDataOrPadding` explicitly preserves data not reached by the
  extractor's song/effect walk. It is not a claim that every byte is understood.
  No executable x86 region is included. `name` is explanatory; `dosOffset`,
  `unit` and `values` determine playback. Do not relocate addressed fields.

The loader checks field ranges, overlap and completeness before building private
sequencer memory. This retains verified DOS pointer/overflow behavior while the
JSON is the sole source of instrument and song data. Reload the viewer after
editing JSON. Keep original extracts as a reference when experimenting.

## What has actually been recovered

The sound files are raw 16-bit drivers, not ordinary samples. The display
overlay receives a sound ID and writes mailbox `+000A`; its timer interrupt
services the selected backend. The EXE alone does not contain this driver.

| Source | Reconstructed behavior |
| --- | --- |
| BUZZER `005Ch` | Consume latest pending SFX ID; `FFh` disables speaker output. |
| BUZZER `009Dh` | Select one of 19 sequences through the table at `0234h`. |
| BUZZER `00D5h..0105h` | Load duration, signed divisor delta and pitch-table index; retain old output for this tick. |
| BUZZER `0108h..0126h` | Output divisor, add signed delta with 16-bit wrap, decrement duration. |
| BUZZER `0129h..0139h` | End sequence and write the inaudible shutdown divisor. |
| VGA `3964h..3985h` | Accumulate timer counts and service audio at threshold `58ECh`. |
| Root `507Bh`, `5B99h` | Jump and object-script sound commands. |

`BuzzerDriver.ts` is a pure interpreter with no browser dependency.
`BrowserSound.ts` schedules its output on a Web Audio square-wave oscillator.
`RuntimeWorld` accepts sound commands at the actual event callsite. Observing
changes to `lastSoundId` would lose repeated identical sounds and effects from
objects that despawn immediately, so those inspector fields are not the queue.

`AdlibDriver.ts` translates the original nine-voice sequencer, including its
music clock divider, instrument/volume tables, pitch slides and effect allocation.
`AdlibSynth.ts` feeds its register writes to the OPL emulator; `BrowserSound.ts`
schedules the resulting PCM. See [third-party attribution](../THIRD_PARTY_AUDIO.md).
If adlib.json is absent, the browser falls back to PC speaker.

Roland/MT-32 output and hardware-accurate PC-speaker timbre are not implemented. The browser uses the nominal PIT clock
1193182 / `58ECh` (about 52.4 service ticks/second); VGA retrace calibration and
interrupt jitter are not reproduced. Very high frequencies above the browser's
Nyquist limit are silenced. Playback is independent of viewer tick-rate changes.
Commands are handed over at gameplay-tick boundaries rather than mid-tick DOS
interrupts, and muting deliberately discards pending playback.


## PC speaker: binary encoding

The supported BUZZER.OVL is 950 bytes. A 19-entry little-endian pointer table begins at 0234h. Each pointer leads to records of three bytes:

| Byte | Meaning |
| --- | --- |
| 0 | Duration; FFh terminates the sequence |
| 1 | Signed 8-bit increment for the PIT divisor |
| 2 | Index into 96 little-endian divisor words at 0174h |

The extractor resolves the pitch index into a divisor in JSON. For example, the following is an invented teaching record, not extracted game content:

```json
{ "duration": 4, "divisor": 1200, "delta": -5 }
```

The oscillator frequency is approximately `1193182 / divisor` Hz. Decreasing the divisor raises pitch. The driver loads a record on one service tick while retaining the previous pitch, then outputs and changes the divisor on subsequent ticks. Arithmetic wraps to 16 bits, matching DOS.

Commands use a single mailbox, not a queue of every requested effect. A later command overwrites an earlier pending one. Zero means no command; FFh stops output. Repeated identical nonzero IDs must still retrigger. This is why gameplay calls the audio interface at the actual event rather than polling a debug “last sound” field.

## AdLib: instruments, voices and compact music

AdLib is FM synthesis: each of nine hardware channels combines two operators to produce a tone. The game sequencer decides which note, instrument, volume and pitch changes to write; the OPL emulator turns those register writes into samples.

The supported ADLIB.OVL is 4077 bytes. Its sequencer has nine 20-byte voice records starting at 0512h. A record retains the current note, duration, instrument pointer, hardware register/channel state, phrase-list pointer, event pointer, volumes, mode, transpose and pitch slide. Mode 0 is free, 1 is music and 2 is a sound effect.

A song uses lists of pointers to phrases, so repeated musical passages need not be duplicated. Notes and control commands share a compact byte stream. Duration bytes encode duration +223; instrument selections encode instrument +192. Note values are driver indices, not MIDI note numbers. Control commands also carry operands for sequencing behavior. The JSON names make the roles readable while retaining original addresses and numeric encoding.

The interpreter decodes these command groups:

| Encoded byte | Meaning |
| --- | --- |
| 00h..7Fh | Note index; key off the old note, set pitch, then wait for current duration |
| 80h | End phrase; take the next phrase pointer or follow the repeat-list pointer |
| 81h | Key off and wait (rest) |
| 82h | Wait without keying off (hold) |
| 83h | Stop music |
| 84h + operand | Set transpose |
| 85h | Key off and free this voice |
| 86h / 87h | Set pitch-slide increment to +1 / -1 |
| B0h..BFh + operand | Set volume value and update operator volumes |
| C0h..DFh | Select instrument, index = byte - C0h |
| E0h..FFh | Set duration, ticks = byte - DFh |

Other control values are rejected by the translated interpreter. The extracted song uses the instrument records present in the supported driver; arbitrary instrument values are not a promise of valid data.

Effects search from the highest voice down for a free channel; when none is free the pending command remains pending. Music uses a divided clock, while effects are serviced each audio tick. The driver translation preserves pointer updates, byte/word wrapping and ordering.

`AdlibDriver` emits OPL register/value pairs. `AdlibSynth` renders stereo PCM at 49,700 Hz through the pinned `opl3` dependency; fractional sample accounting keeps service ticks aligned with samples. `BrowserSound` schedules the PCM with a short lookahead. The game driver and OPL chip emulator are separate components.

## Code map and data flow

```text
Original sound OVL -> SoundAssets extraction -> readable local JSON
Gameplay / ScriptVM sound event -> BrowserSound -> selected driver
  PC speaker: BuzzerDriver -> divisor changes -> Web Audio square wave
  AdLib: AdlibDriver -> OPL register writes -> AdlibSynth -> PCM -> Web Audio
```

| File | Responsibility |
| --- | --- |
| [SoundAssets.ts](../../src/game/audio/SoundAssets.ts) | Extract and validate the versioned JSON layouts |
| [BuzzerDriver.ts](../../src/game/audio/BuzzerDriver.ts) | Pure tone interpreter and original record timing |
| [AdlibDriver.ts](../../src/game/audio/AdlibDriver.ts) | Nine-voice music/effects sequencer |
| [AdlibSynth.ts](../../src/game/audio/AdlibSynth.ts) | Register writes to PCM |
| [BrowserSound.ts](../../src/game/audio/BrowserSound.ts) | Browser audio permission, scheduling and lifecycle |
| [import-sound.mjs](../../tools/import-sound.mjs) | Original folder to local JSON |
| [build-audio.mjs](../../tools/build-audio.mjs) | Copy the installed OPL browser bundle |

## Validation

Run `npm run smoke` after importing assets and audio. The audio regressions cover tone timing, signed sweeps, wrapping, mailbox replacement, retriggers, lifecycle, gameplay event delivery, JSON round trips and non-silent AdLib PCM.

The AdLib smoke test renders music and effects to finite, nonzero PCM. An optional
stronger check executes the original driver in a memory-only x86 emulator and
compares every OPL register write, voice byte and clock value with TypeScript:

```powershell
python -m pip install unicorn
python tools/adlib-oracle.py C:/path/to/SIMPSONS/ADLIB.OVL obj/adlib-oracle.json
node tools/check-adlib-oracle.mjs wwwroot/data/audio/adlib.json obj/adlib-oracle.json
```

This comparison passes 10,000 ticks with music start/stop/restart and all effect
IDs 1..18. It validates the sequencer, not analog speaker timbre or DOS timer jitter.
Keep generated traces local: they contain data derived from your game files.


## Troubleshooting

| Symptom | Explanation / action |
| --- | --- |
| Silent browser | Click the sound control to resume Web Audio; check volume and pause state. |
| No AdLib music | Confirm `wwwroot/data/audio/adlib.json` exists and choose AdLib. PC speaker provides effects rather than the AdLib music. |
| Unsupported driver | Check the original DOS release and file size; packed graphics overlays are not interchangeable with sound drivers. |
| JSON validation error | Preserve offsets, field widths and completeness; reimport to undo local experiments. |
| Changed JSON has no effect | Reload after editing. Reimporting replaces the generated JSON. |
| Sound stops on hiding the tab | Intentional lifecycle handling; it prevents stale scheduled output continuing in the background. |

A sequencer oracle match proves the tested digital driver behavior, not identical analog speakers, hardware filtering or interrupt timing. Roland/MT-32 remains outside the implementation.
