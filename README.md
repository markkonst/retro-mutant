# Retro Mutant — The Simpsons DOS reconstruction

A hobby TypeScript reconstruction and reverse-engineering viewer for **The Simpsons: Bart vs. the Space Mutants (DOS)**. It runs in a browser, using graphics, level data and object scripts extracted locally from your own copy of the game.

The aim is to understand how the DOS game works and make that knowledge readable and testable. This is a new runtime for the recovered data, not a DOS emulator or a complete port. **Level 1 is the main implementation target; full DOS parity is not yet verified.** Levels 2–5 can be loaded for research, but their level-specific behavior is not complete.

## Before you start

You need:

- A lawfully obtained copy of the supported **DOS** release. Other platforms are incompatible.
- Node.js with npm (the current project has been tested with Node 22).
- Python 3.10 or newer, with Pillow for image extraction.
- A modern browser. Visual Studio is optional.

The repository contains no original game assets. Extract your game archive into a folder containing `SIMPSONS.EXE`, `LEVEL1.OVL` through `LEVEL5.OVL`, and `VGA.OVL`. For sound, also keep `BUZZER.OVL` and optionally `ADLIB.OVL` there.

## Quick start

Clone or download this repository, open a terminal **in its root directory**, then run the following. These are PowerShell examples; replace the example game/output paths with your own.

### 1. Install dependencies

```powershell
npm ci
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install Pillow
```

On Linux/macOS, use `python3` to create the environment and `.venv/bin/python` in place of `.\.venv\Scripts\python.exe`. Ghidra, Capstone, Unicorn and DOSBox are not required for normal setup.

### 2. Unpack and extract your game data

```powershell
.\.venv\Scripts\python.exe tools/unpack_simpsons.py --input "C:/games/SIMPSONS" --output "C:/assets/retro-mutant/UNPACKED"
.\.venv\Scripts\python.exe tools/export-viewer-assets.py "C:/assets/retro-mutant/UNPACKED" --export "C:/assets/retro-mutant/data"
npm run import-assets -- "C:/assets/retro-mutant/data"
```

The first command removes executable compression. The second decodes graphics and gameplay tables. The third copies them into `wwwroot/data`. Use a **fresh directory** for the export command. Skips for the raw sound drivers during unpacking are expected.

### 3. Import sound (optional)

```powershell
npm run import-sound -- "C:/games/SIMPSONS"
```

This reads the **original game folder**, not UNPACKED, and creates readable PC-speaker and AdLib JSON. BUZZER.OVL is required by this importer; ADLIB.OVL is optional. AdLib provides music and FM effects; PC speaker provides buzzer effects. Roland/MT-32 is not implemented.

### 4. Run

```powershell
npm run dev
```

Wait for TypeScript compilation, then open [localhost:5173](http://localhost:5173). Keep the terminal running. The development command recompiles TypeScript as you edit; reload the browser to use changes. Click the sound button to enable audio: browsers require a user gesture.

A successful import has this layout (with level2 through level5 alongside level1):

```text
wwwroot/data/
  dos_font_8x8.bin
  level1/
    background_map.png
    manifest.json
    runtime_data.json
    object_scripts.json
    player_runtime.json
    event_messages.json
    object_frames/
    bart_frames/
  audio/                     # optional sound import
    pc-speaker.json
    adlib.json
```

Generated data stays local and is ignored by Git. Do not commit original files or extracted JSON, images, music or fonts.

## Playing and inspecting

Click the game area so keyboard input is not focused on a form control. The simulation must be running.

| Input | Action |
| --- | --- |
| O / P or Left / Right | Move |
| Q or Up | Jump; interact with supported storefronts |
| A or Down | Hold inventory mode; release to use the selected item |
| Hold A, tap Space | Select the next available inventory item |
| Space | FIRE / spray / current action |
| F8 | Play or pause |
| Period (`.`) | Advance one simulation update |

**X-ray starts selected.** Press and release A **without Space** to turn it on. Its status reads ON, the scene uses the original orange/brown palette, and disguised aliens change appearance. It expires after 250 gameplay updates; using it again turns it off early.

The viewer also offers object selection, a script inspector, collision/terrain overlays and debug invulnerability. These are research tools, not evidence that the original game offered those controls. See [runtime and controls](docs/runtime/README.md) for advanced behavior.

## Current scope

Level 1 has recovered movement, shops, many item interactions, alien tokens/Maggie, the timed cinema passer-by, Jebediah's bird/message, and the Nelson fight. Isolated regressions cover these chains; a complete ordinary playthrough with every objective has **not** been verified.

Some collisions, source-loading rules and presentation remain partial. A separate cinema interior/bonus show and Jebediah head-jumping reward remain unproven in the DOS research. The [level chapters](docs/levels/README.md) distinguish implemented behavior from unknowns.

## Learn how it works

Start with the [documentation guide](docs/README.md). Each chapter explains the original format or behavior, the TypeScript implementation, and its limits.

| Topic | Guide |
| --- | --- |
| Asset extraction and binary formats | [Assets](docs/assets/README.md) |
| PC speaker, AdLib, music and sound JSON | [Audio](docs/audio/README.md) |
| Object scripts, waits, spawning and native calls | [ScriptVM](docs/scriptvm/README.md) |
| Collision geometry and handler coverage | [Collisions](docs/collisions/README.md) |
| Story events and level-specific handlers | [Levels 1–5](docs/levels/README.md) |
| Recovered function behavior and confidence | [DOS function catalogue](docs/DOS_FUNCTION_CATALOG.md) |
| Development, tests and research workflow | [Contributing](CONTRIBUTING.md) |

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Missing data / blank level | Complete all three asset commands. Files must be directly inside `wwwroot/data/level1`, not `wwwroot/data/data/level1`. |
| Unsupported file/signature | The tools target one recovered DOS layout. Do not use console/Amiga files or remove validation checks. |
| Export destination already exists | Export to a new directory, then import that directory. |
| No sound | Import sound from the original folder, enable it with a click, and check the selected backend. See [audio troubleshooting](docs/audio/README.md#troubleshooting). |
| Keys do nothing | Click the play area and ensure the simulation is running; inputs/selects/buttons retain keyboard focus. |
| Changes are not visible | Wait for a successful build, then reload. |
| Port 5173 is occupied | Reuse the existing server or stop your previous development command before starting another. |
| A script is blocked | Read its PC/native address in the inspector. Some level-specific routines are not implemented; this is distinct from an asset import failure. |

## Development

```powershell
npm run check       # TypeScript check, no generated game data needed
npm run build       # compile and copy the OPL browser dependency
npm run smoke       # full regression suite; requires local extracted assets
```

You can also open `retro-mutant.slnx` or `retro-mutant.esproj` in Visual Studio, choose **Simpsons Viewer (Edge)** or Chrome, and press F5. This starts the same development server. See [Contributing](CONTRIBUTING.md) for debugging and how to propose a change.

## Legal and attribution

This is an unofficial hobby project created for fun, learning and exploring how the original DOS game works. We respect the original creators and rights holders and have no intention of infringing their copyrights or trademarks. This project is not affiliated with, endorsed by or sponsored by the owners of *The Simpsons* or *Bart vs. the Space Mutants*. All rights in the original game, characters, names, artwork, music and other original materials remain with their respective owners.

The repository provides the reimplementation and extraction tools without distributing the original game files or decoded game assets. Users must supply a lawfully obtained copy of the supported DOS game and generate the required assets locally. Do not commit or redistribute original game files or extracted assets through this repository. The [MIT license](LICENSE) covers this project's original contributions; it does not grant rights to the original game or any third-party material.

This statement describes our intentions and does not grant permission to use protected material or establish that a particular use is legally permitted. If you are a rights holder with a concern, please contact the maintainer through this repository so it can be reviewed and addressed.
