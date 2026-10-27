## Unreleased

- Play the original PC-speaker SFX through a validated local BUZZER.OVL import and Web Audio; add a sound toggle and event callbacks.
- Recover Level-1 arena action state 6, its reserved projectile, Nelson HP and boss/helper collisions; test the real death script through level completion.
- Export boss HP/rectangle fields from the original level config.
- Expand dense runtime/Level-1 code and add a beginner's guide with explicit fidelity limits. Roland/MT-32 output and full Level-1 parity remain open.

# Changelog

## Level-1 story chains

- Recover Maggie activation from six alien tokens using 07AF/07B1 and the original helper source; verify her ball deals three damage to Nelson.
- Test the complete 400/200 cinema passer-by spray transitions and the Jebediah rocket/bird/message sequence.
- Show collected MAGGIE letters and the original statue message on the canvas with reconstructed presentation. Separate cinema visits and head-jumping rewards remain unproven.


## End-of-level gate retreat

- Preserve outward fractional velocity when Bart touches a solid edge, fixing the closed Level-1 gate trapping him.
- Test walking to and away from the closed gate, and the original Nelson arena boundary after clearing objectives.


## Readable sound assets

- Extract PC-speaker tone records and named AdLib data fields to versioned JSON; browser playback uses JSON only.
- Preserve DOS addresses, instrument parameters, phrase pointers and note/control stream annotations for contributors.
- Validate JSON layouts and compare JSON-driven AdLib playback to 10,000 original x86 service ticks.


## Item and story regression audit

- Replace approximate cherry-bomb physics with original left/right reserved scripts, including ground wait and explosion frames.
- Test all eight Grandpa coin spawns, whistle location bounds, sound and one-shot departure, plus bomb target hit/miss and 400/200 passer-by time gates.
- Document that cinema entry/bonus-show behavior remains unresolved; timed passer-by behavior is not a completed cinema feature.

## AdLib and rocket reconstruction

- Translate ADLIB.OVL music/effect sequencing and render it through an attributed OPL emulator; retain selectable PC-speaker sound.
- Verify the sequencer against original x86 execution for 10,000 ticks, including music restart and all effect IDs.
- Run original reserved rocket scripts for fuse ignition, signed flight, acceleration, explosion and expiry; verify hits on all six Level-1 targets.
- Add readable audio documentation and reproducible regression commands. Level 1 is still not certified complete.


## 0.9.6 - Level-1 paint states, X-Ray, storefront visuals and Nelson gate

- Implemented `ExternalSpecial3Bytes` as live runtime state instead of a viewer no-op. Level 1 now reproduces the altered `04 0A 06` background-palette state for the sprayable poster T38â†’T39 and the wrench/water awning T73â†’T74, recoloring the local purple DOS background art red.
- Implemented collision handler 20 (`6E50h`) against the configured external countdown source. WRENCH now arms source #27 at `803Fh`; its low byte counts down and T73 transitions to T74 when it reaches zero.
- Reconstructed T90 as the timer-400/200 controller: it spawns T91, whose decoded six-frame `D209..D214` sequence moves at `VX=-0140h`, `VY=0100h` before continuing horizontally.
- Replaced the yellow moving ROCKET placeholder with the recovered stationary type-4 reserved action object and decoded Level-1 rocket frames 4..7.
- Added the DOS X-RAY alternate-graphics rule: while `07DE != 0`, objects with flag `0400h` resolve `+48h` / six descriptors later; alternate descriptor images are preloaded even when scripts do not reference them directly.
- Wired recovered Level-1 storefront common-overlay pointers to decoded door-frame surrogates, so shop state 02 visibly opens the door and state 0C restores the closed pose while retaining the original four transient pool slots.
- Added `SetLevelCameraState` VM semantics and Bart's recovered left world bound. Nelson source #125 now enters the boss arena with `minX=30B7h` and `maxX=31E3h`.
- Added LevelRuntimeConfig goal-gate source support. When the final Level-1 objective reaches zero, source #123 (`Level1_GoalBarricadeSource`) is cleared/released so Nelson can stream into view. The later no-return boss-arena bound is preserved as original DOS behavior.
- Added dedicated v0.9.6 regressions for T38/T39, T73/T74, handler20 countdown, T90/T91, X-RAY, rocket action, goal barricade removal, Nelson bounds, and open/closed shop-door descriptors.

## 0.9.5 - Exact jump-to-run transition

- Corrected the DOS run interpretation: `Space` is not required. A plain `Q` jump remains at the normal `0200h` cap while airborne, then landing with `Q` still held promotes Bart to `0400h` with animation reload `1`; `O/P` can begin before or during the jump.
- Restored ordinary base-ground landing inside the jump state (`5114h..513Eh`) before horizontal acceleration, matching DOS ordering. Static-terrain contacts retain their separate `4E5Ah` Q-held promotion, including special spring terrain.
- Releasing the grounded Q latch resets `0400h -> 0200h` and animation reload `1 -> 3`, matching `500Eh..5034h`.
- Kept `Q + Space` as the distinct optional DOS fast-jump startup path (`508Bh..50A2h`): it promotes to `0400h` immediately and consumes FIRE, but is no longer described or tested as the normal way to run.
- Added regression coverage for starting horizontal movement only after takeoff and still entering run state on landing.

## 0.9.4 - DOS controls, storefronts, special bounce and test cheats

- Restored the original primary DOS gameplay controls: `O/P` left/right, `Q` up/jump, `A` down and `Space` FIRE, with arrows retained only as viewer aliases; Play/Pause moved to `F8`.
- Inventory selection now uses the recovered `A + Space` flow and activates the selected item when `A` is released.
- Corrected jump ordering/semantics: `UpdateBart` runs before the weapon pass, `Q+Space` consumes FIRE on jump startup, enables the `0400h` run speed cap and suppresses weapons during the moving airborne run-jump.
- Corrected special static-terrain bounce: Level-1 parking-meter terrain now uses the forced `0837=09h`, `velocityY=-0580h` no-gravity hold phase instead of immediately entering gravity.
- Implemented the Level-1 storefront `07F1/07F2` states `02..10`, three recovered 28-byte shop records, four real transient 28-slot-pool reservations/repoints, `O/P` selection, `Space` purchases, binary stock, packed-BCD coin/item counts and `A` exit. Original `30xx` transient shop rasters remain undecoded; the viewer shows a DOS-font semantic popup.
- Added a persistent viewer-only **Invulnerable** toggle that blocks normal Bart damage without modifying the DOS `083D` blink timer.
- Implemented recovered cheat effects: `COWABUNGA` = unlimited lives; Numpad `-` + `EATMYSHORTS` = unlimited lives plus `F` setting the normal level-finished flag. Cheat state persists across viewer level loads.
- Initialized the recovered game-start inventory bytes (`COIN=10` packed BCD, `PAUSE=1`) so shops are immediately testable.
- Added dedicated shop and DOS-control/cheat regression tests and updated the input/spray regression.

## 0.9.3 - Level-1 skateboard player path

- Reconstructed `LevelSpecificPlayer_Level1` skateboard-zone ownership for `0x0D6C <= BartX < 0x2180` under `src/game/levels/level1/`.
- Implemented the recovered `UpdateBartSkateboardPhysics` input latches, push/impulse animation state, `Â±0x0800` speed clamp, 8.8 X integration, facing gate, camera band and skateboard descriptor families (`0x40` / spray-can `0x5A`).
- Added the DOS gameplay `02h` down input separately from inventory mode so grounded `FIRE+up/down` can adjust the skateboard base-Y clamp (`0x72..0x80`) without a Level-1 input hack.
- Skateboard entry now disables source #53/#83 (type 61) and exit restores their `8000h` source-active bit; clearing a persistent source-active bit generically releases a resident runtime slot to avoid ghost scripts/colliders.
- Added typed runtime bridges for shared Bart jump, terrain, descriptor refresh and camera access plus a dedicated skateboard smoke regression.

## 0.9.2 - Spray action-object visual fix

- Render the recovered reserved `DS:0EB7` spray action object instead of showing only its collision debug line.
- Load the four non-script-referenced spray descriptors (`object_000`..`object_003`) and alternate them with the recovered 0/0Ch/18h/24h render-offset cadence.
- Preserve the existing spray hitbox, ammo timing, Bart descriptors and collision transitions unchanged.
- Extend the input/spray regression to verify visual anchor, frame toggle and cleanup after FIRE release.

## 0.9.1

- Added Visual Studio `.vscode/launch.json` browser launch profiles for Edge and Chrome at `http://localhost:5173`.
- Added `npm run debug-check` to validate browser launch settings and TypeScript source-map resolution.
- Documented the one-F5 browser-debug workflow; no gameplay/runtime behavior changed.

## 0.9.0

- Added a typed per-level handler architecture under `src/game/levels/` with explicit initialize/reset/dispose lifecycle.
- Level changes now unload the previous handler set before loading the new one; `App.loadLevel()` disposes the old `RuntimeWorld`.
- Moved modeled Level-1-only behavior into focused `level1` handlers for player dispatch, inventory, native FAR callbacks and presentation/HUD hooks.
- Added typed engine event points for per-frame player dispatch, inventory item use, VM native calls, child spawning and level-specific HUD meters.
- Accounted for all 14 decoded `Level1Native_*` callbacks referenced by Level-1 scripts, including link/countdown, boss registration and type-67 conditional branching.
- Fixed native CFG handling so `native_fallthrough` edges are recognized as real fallthrough paths.
- Added the recovered `LevelSpecificPlayer` hook before common Bart physics, giving Level 1-5 a clean home for future per-level movement/state machines.
- Fixed the spray animation regression: the DOS `+18h` action descriptor offset is now applied only on the moving animation path, so idle FIRE no longer shows skateboard frames.
- Added a Level-1 spray regression that verifies the sprayable visual transition from type 15 / descriptor 117 to type 16 / descriptor 116.
- Renamed the shared DS:0815 runtime field to `sprayMeter0815` to keep generic spray state out of Level-1-specific naming.
- Added handler lifecycle/native/spray regression coverage and documented the remaining recovered Level-1-only player/skateboard state that is not yet approximated.

## 0.8.0

- Replaced one-object-per-source runtime with a fixed 28-slot DOS-style object pool and camera-driven persistent-source streaming.
- Implemented `SpawnChild` / `SpawnChildAfterCurrent`, parent links, transient allocation and slot retry/skip semantics.
- Implemented `SetGlobalEventData`, decoded event-message assets and reconstructed speech text rendering using the DOS font.
- Added recovered Level-1 native FAR callbacks, including the original eight-target prank-call script selector.
- Completed the data-driven Level-1 payphone/Moe sequence from COIN activation through speech bubbles and Moe type-11 spawn.
- Added full per-object VM script inspection with live wait/current/blocked/branch states, visit counters and execution history.
- Fixed browser key-up for FIRE and inventory input; spray no longer drains after a physical key release.
- Corrected spray action-hitbox positioning and connected Bart action animation state.
- Expanded reserved-projectile collision behavior; matrix is now 26 implemented / 8 partial / 9 deferred.
- Added input/spray and story/VM regression tests while retaining the existing collision, inventory, HUD and clothesline suites.

## 0.7.0

- Fixed DOS zero-height collision profiles: line colliders are now valid instead of being rejected by the generic AABB helper.
- Fixed the two Level-1 clothesline sheets: grounded Bart contact transitions type 63 â†’ 64, starts the falling animation/`+0x0100` Y motion and settles as type 65; negative transition score/event/goal side effects are wired.
- Added a recovered 14-slot `InventorySystem` with packed-BCD counts, selector repeat/timeout state and the DOS item-use dispatch model.
- Added X-ray toggle, coin/wrench/magnet/whistle source gates, cherry-bomb/rocket/donut transient actions, key teleport and pause behavior.
- Added spray, slingshot and dart-gun FIRE paths with recovered ammo/submeter behavior.
- Implemented collision handler 15 against Bart's separate facing-dependent action hitbox instead of body AABB fallback.
- Added the recovered per-level inventory/progress source pointers to `player_runtime.json`.
- Added a 320Ã—200 DOS-style Canvas composition and an original 8Ã—8 font extracted from `VGA.OVL` for HUD text/numbers.
- Added runtime HUD rendering for score/lives/time/goals, selected inventory/count and level-specific meters; the previous modern HUD is now an optional debug overlay.
- Added clothesline and inventory regression smoke tests.
- Common `GENERAL.OVL` inventory icon rasters and several transient weapon/item graphics remain non-pixel-exact; v0.7 uses compact DOS-font/pixel symbols while preserving the recovered icon metadata offsets.

## 0.6.0

- Fixed the invisible Level-1 source #0/type-15 street object at X=88: unaligned `SetStaticFrame(0x0075)` now resolves to Bart/common descriptor #117 instead of object descriptor #9.
- Added explicit object-vs-Bart/common descriptor-bank state to runtime objects and covered the equivalent special static-frame families in Levels 1, 2 and 5.
- Refactored object collision dispatch into a literal 43-entry table matching DOS `Collision_HandlerJumpTable @ 5F67h`.
- Added per-handler DOS offset/name/fidelity metadata and inspector output.
- Expanded collision globals for recovered `0766`, `0768`, `076A`, `076C`, `0780`, `0784`, inventory counters and related level-specific state.
- Added/expanded functional equivalents for direct damage/transition, pickup, top-contact, platform, pattern, counter, bounce and progression handlers.
- Corrected handler 1 so an even non-zero transition does not also damage Bart.
- Corrected deferred action/secondary-hitbox handlers (including handler 15) so they do not invent Bart body-AABB collisions when the DOS routine expects a separate action/projectile hitbox.
- Added `docs/COLLISION_HANDLER_MATRIX.md` with all 43 entries and explicit implemented/partial/deferred status.
- Added special-static-frame, 43-entry matrix and extended collision regression smoke tests.

## 0.5.0

- Split Bart damage state into the recovered `083B` hit/death countdown, `083C` blink phase and `083D` invulnerability timer.
- Added the recovered two-hit health buffer (`0770`, initialized to 1) and three-life state (`076F`, initialized to 3).
- Added life loss, game-over state and provisional level-start respawn. Exact DOS checkpoint selection remains future work.
- Added exact `BuildBartRenderObject` blink gating: four visible phases, four hidden phases while invulnerable.
- Added a live HUD for lives, health, six-digit score, timer, goals and hit/invulnerability state.
- Added recovered 999 timer initialization and `0x1E` first / `0x23` recurring tick-divider behavior.
- Added per-level initial packed-BCD goals from `LevelRuntimeConfig +0x0E` to `player_runtime.json`.
- `DecrementObjectiveCounterBCD` now updates the live goal counter instead of being a viewer no-op.
- Added proven common collision HUD effects: handler 2 (+60 + life), handler 6 (+100), handler 19 (+50 + `0xFA` invulnerability), and negative collision-transition +100 score.
- Added a dedicated damage/HUD smoke test while retaining all v0.4 collision regression tests.

## 0.4.1

- Added an explicit **physics collisions** checkbox, enabled by default.
- Collision ON/OFF badge is dynamic instead of hardcoded.
- Added a visible version badge so stale browser/project sessions are obvious.
- `collision boxes` remains visualization-only; it does not control physics.

## 0.4.0

- Added `CollisionSystem` using the recovered Bart 12Ã—24 hitbox and per-type `CollisionProfile` data.
- Added StaticTerrain landing/spring behavior.
- Added horizontal solids, one-way/moving platforms, bounce objects and physical hazard/top-contact paths.
- Added handler-1 damage/invulnerability core and safe direct pickups/transitions.
- Added collision debug rendering and smoke tests.

## 0.3.0

- Added controllable `BartPlayer` runtime and original Bart frames for all five levels.
- Added keyboard walking/jumping, recovered fixed-point movement and Bart animation state.
- Added Bart inspector and camera follow.

## 0.2.0

- New standalone Visual Studio project.
- Added `GameObjectRuntime` + `ScriptVm`, exact object animation stepping, motion, playback controls and five-level smoke test.
