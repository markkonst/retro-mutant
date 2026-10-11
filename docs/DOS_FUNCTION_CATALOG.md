# Recovered DOS function catalogue

Catalogue of the functions and code entrypoints identified so far for **The Simpsons: Bart vs. the Space Mutants (DOS)**. Consolidated from the local Ghidra V10/V11 material and the supplied research chat through viewer v0.9.6. Descriptions preserve the Ghidra source wording, with explicitly marked chat refinements.

A recovered DOS function is not necessarily fully implemented in the browser. This document records original behavior and research confidence; see [the collision matrix](COLLISION_HANDLER_MATRIX.md) and [level-handler documentation](LEVEL_HANDLERS.md) for implementation coverage.

## Address conventions

- **Root EXE:** `0000:offset` is the base-zero Ghidra/raw-image notation for the root code, not an absolute DOS load address. Runtime relocation changes the physical segment. `DS:xxxx` inside descriptions denotes a data-field offset, not a function address.
- **Embedded Level-1 native code:** use the original relative FAR address `096D:offset`; the separate flat column is `segment * 16 + offset`. For example, `096D:3117` corresponds to flat `0xC7E7` in the EXE image.
- **Overlay:** `VGA:offset`, `ADLIB:offset`, etc. mean an offset in that named overlay's own load image. Its runtime segment depends on loading; offsets from different overlays are not interchangeable.
- Table slots, script addresses, internal jump targets and falsely detected functions are distinguished below. A VM handler address is executable code; a script record such as `096D:245E` is data interpreted by that code.
- `HIGH`, `MEDIUM-HIGH`, `MEDIUM` and `LOW` are inherited research confidence levels, not proof of implementation or a new audit. `Not graded` means the detailed V10 map supplied no corresponding confidence grade.

## Sources and precedence

| Key | Local source | Use |
| --- | --- | --- |
| MAP10 | `Simpsons_Ghidra_V10/Simpsons_Ghidra_V10/SIMPSONS_V10_FUNCTION_MAP.md`, backed by `reference/assembly.txt` and `reference/SIMPSONS.c` | Detailed root-function names/descriptions; preferred over older summaries. |
| CSV11 | `simpsons_ghidra_starter_v11/all_functions.csv`, `v6/v7/v8/v9_new_functions.csv`, recovered-code CSVs and `all_labels.csv` | Additional entries, confidence and internal labels. |
| FIX10 | `v10_function_corrections.csv` | Corrects the false standalone boundary at 68E8. |
| OV11 | `ApplyDisplayOverlayV11.java`, `ApplySoundOverlayV11.java`, `ApplyLevelResourceOverlayV11.java`, `ApplyPresentationResourceOverlayV11.java`; display/sound layout CSVs | Overlay code entrypoints and APIs. Display API targets are read from the local unpacked pointer tables. |
| CHAT | Supplied old research chat, spanning v0.9.2–v0.9.6 and the 45-scene Level-1 catalogue | Later gameplay interpretations and corrections, explicitly marked in descriptions. |

The Ghidra bundles remain local under `sandbox/TOOLS/Ghidra scripts`; this document includes semantic descriptions, not binary assets or copies of the game listing. The old `KNOWN_FUNCTIONS.md` still says v3/183 entries, so it is not used as the completeness authority. V10 corrections take precedence, including removal of 68E8 as a standalone function.

## Root executable and embedded Level-1 natives

**214 unique recovered executable entrypoints**. Each address appears once here; internal labels and quarantined detections are listed separately.

### bart

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:2BD1` | `0x2BD1` | `BuildBartRenderObject` | Builds the 0x30-byte Bart render object at DS:08E7 from g_BartX/g_BartY and the current Bart renderOffset. Implements the recovered blink gate: while g_BartInvulnerabilityTimer != 0, decrement it, increment g_BartBlinkPhase modulo 8, and suppress Bart from the render list when (blinkPhase & 4) != 0. blinkPhase==0xFF also suppresses rendering. Thus the normal damage blink is four visible phases followed by four hidden phases. | HIGH | MAP10 |
| `0000:331E` | `0x331E` | `ResetBartAndGameplayState` | Resets Bart movement/action/jump state and several level interaction bytes. Sets Bart Y and g_BartBaseYClamp from LevelRuntimeConfig.bartBaseYDefault, movement max speed to 0x0200, health counter to 1 (two hit cycles before a life is consumed), and reinitializes HUD frame graphics. g_BartHitDeathTimer and g_BartBlinkPhase are cleared here. | HIGH | MAP10 |
| `0000:38D0` | `0x38D0` | `LevelSpecificPlayerDispatch` | Current-level-indexed near jump-table dispatch for per-frame player rules. Routes to LevelSpecificPlayer_Level1..Level5 and the common/default entry. | HIGH | MAP10 |
| `0000:4F2D` | `0x4F2D` | `UpdateBartAnimation` | Selects Bart sprite/renderOffset from movement, facing, airborne/action and idle state; maintains animation timers/frame state used later by BuildBartRenderObject. | HIGH | MAP10 |
| `0000:4FEF` | `0x4FEF` | `UpdateBartJumpState` | Jump state machine. Jump starts with signed 8.8 Vy=-0x0400, supports a short held-jump phase (counter initialized to 7), then applies +0x0070 gravity. Vertical position is integrated against g_BartBaseYClamp; landing clears airborne/Vy. This path is independent from static/object collision resolution, which can land Bart earlier. Chat correction in v0.9.5: holding Q through landing enables speed cap 0400 and animation reload 1; releasing Q on the ground restores 0200/3. Q+Space also provides an optional fast start. | HIGH | MAP10+CHAT |
| `0000:5143` | `0x5143` | `UpdateBartSkateboardPhysics` | Alternate skateboard movement/state path with its own vertical controls, impulses, animation state and horizontal motion handling. Chat: 084C/084D direction latches, 084E push impulse, 0850 animation state, 0852 mode, low-byte 082C fixed-point fraction, speed clamp +/-0800 and animation banks 40/5A. Alternate 1598 camera route remains incompletely recovered. | HIGH | MAP10+CHAT |
| `0000:54BF` | `0x54BF` | `UpdateBart` | Main Bart update. Runs level-specific player logic, jump/skateboard/common movement, signed 8.8 horizontal integration and terrain checks, then animation selection. Object collisions are NOT resolved here; they run later in the frame through ProcessBartObjectCollisions. | HIGH | MAP10 |
| `0000:6F5E` | `0x6F5E` | `UpdateBartActionAndWeaponState` | Builds and advances Bart's action/weapon state after normal Bart animation. Manages the reserved action/projectile GameObject(s), facing-dependent attack hitboxes/render offsets, inventory-powered actions and their timers. Collision handlers 14-18/24-27/35/38/39/41 depend on these secondary/action objects rather than Bart's normal body box. Chat: spray is a reserved action object (descriptors 0/1 right, 2/3 left). Rocket state 4 initializes a stationary transient graphic object; it is not a horizontally flying projectile. | HIGH | MAP10+CHAT |
| `0000:787E` | `0x787E` | `ApplyPendingBartTeleport` | Consumes pending teleport/reposition globals, writes Bart/camera position and rebuilds the viewport/streaming state. | HIGH | MAP10 |
| `0000:7A39` | `0x7A39` | `HandleBartHitDeathAndRespawn` | Blocking hit/death state machine driven by g_BartHitDeathTimer. The timer is normally set to 0x32 on damage; at 0x19 it triggers the midpoint sound/HUD stage. When the timer expires, decrement signed g_BartHealthCounter. If health remains >=0, resume gameplay (timer-zero edge can add an extra delay stage). If health goes negative, optional cheat flags bypass life loss; otherwise decrement g_LivesRemaining and enter game over at zero. Surviving death prepares objects, selects a level/checkpoint-dependent respawn, repositions Bart, calls ResetBartAndGameplayState and resumes. This is why ordinary damage does not directly decrement lives at collision time. | HIGH | MAP10 |
| `0000:7B76` | `0x7B76` | `UpdateHitDeathHudStage` | Midpoint presentation step called when g_BartHitDeathTimer reaches 0x19; redraws two HUD blocks and flushes/updates the display. | MEDIUM | MAP10 |
| `0000:7CDA` | `0x7CDA` | `BeginBartHitInvulnerability` | Starts post-hit blinking/invulnerability: sets g_BartBlinkPhase=0 and g_BartInvulnerabilityTimer=0x64 (100). The collision handler separately sets g_BartHitDeathTimer=0x32. BuildBartRenderObject owns the timer decrement and visible/hidden blink gating. | HIGH | MAP10 |

### bcd

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:3627` | `0x3627` | `BCD_Decrement` | Decrements a four-digit packed-BCD word with decimal borrow propagation. Used by timer, goals and inventory/progression counters. | HIGH | MAP10 |
| `0000:367E` | `0x367E` | `BCD_IncrementWord` | Increments a four-digit packed-BCD word with decimal carry propagation. | HIGH | MAP10 |
| `0000:370E` | `0x370E` | `BCD_AddUnitsToWord` | Adds CL to the units position of packed-BCD AX and propagates decimal carries across all four nibbles; wraps to zero on overflow. | HIGH | MAP10 |
| `0000:3764` | `0x3764` | `BCD_AddTensToWord` | Adds a tens-position amount to packed-BCD, propagates decimal carries and exposes overflow through flags/return state. | HIGH | MAP10 |

### camera

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:35E7` | `0x35E7` | `UpdateCameraHorizontal` | Updates horizontal camera/world scroll using Bart motion plus clamp/override state. Camera X is bounded by the current level config. | MEDIUM | MAP10 |
| `0000:78AF` | `0x78AF` | `RepositionBartAndRebuildViewport` | Flushes display work, sets camera X and Bart-relative X, then rebuilds terrain/object streaming windows around the new viewport. | HIGH | MAP10 |

### collision

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:5EFF` | `0x5EFF` | `ProcessBartObjectCollisions` | Scans exactly 28 runtime GameObject slots. Bart's body box is fixed at left=x+2, right=x+14, top=y+4, bottom=y+28. For an active object with nonnegative typeOffset, typeOffset is multiplied by 6 (12-byte CollisionProfile stride), the profile handlerTableOffset is read, DI advances to profile+2, and CS:[Collision_HandlerJumpTable + handlerTableOffset] is called. handlerTableOffset is therefore 2*collisionIndex. g_PlatformContactY is cleared before the scan. Different object types obtain different collision behavior entirely through these profiles/handler indices. | HIGH | MAP10 |
| `0000:5FBD` | `0x5FBD` | `Collision_SpecialObjectType14HitElseEvent` | Checks reserved action object type 0x0E and region/AABB. Matching hit applies target transition; otherwise, when current object low flag bit permits, routes to Collision_ConsumeObjectAndTriggerEvent7. Secondary/action-object dependent. | MEDIUM | MAP10 |
| `0000:6054` | `0x6054` | `Collision_FallingLargeObjectHazardOrTopContact` | Special falling/large-object geometry. Certain top/side overlap while invulnerability is zero starts normal damage + hitDeathTimer=0x32; otherwise tail-routes into Collision_TopContactBounceBreakOrDamage for bounce/break semantics. | MEDIUM | MAP10 |
| `0000:6086` | `0x6086` | `Collision_DamageBartIfObjectField2CZero` | Gate wrapper: only when low byte of GameObject.motionReferenceX (+2C) is zero does it tail-enter generic Collision_DamageBartOrTransitionObject. | HIGH | MAP10 |
| `0000:6090` | `0x6090` | `Collision_PlatformLandingAndToggle76C` | Clears g_LevelToggle076C, invokes moving-platform landing behavior, then bitwise-NOT toggles 076C when g_LevelSequenceProgress076A==0x1C. | MEDIUM | MAP10 |
| `0000:60A6` | `0x60A6` | `CallMovingPlatformLandingAndUnwind` | Stack/register bridge into handler 12. It exists to preserve the collision dispatcher's unusual register/stack continuation convention. | HIGH | MAP10 |
| `0000:60AB` | `0x60AB` | `Collision_CollectSequenceTokenAndAdvance` | Unless sequence progress 076A already equals 0x1C: body AABB, award 50 points, add 4 to g_LevelSequenceProgress076A, remove runtime object and clear source active state. | HIGH | MAP10 |
| `0000:60D6` | `0x60D6` | `Collision_AirbornePatternMatchTransition` | Airborne-only body AABB. Compares low object flag nibble to AirborneCollisionPatternTable selected by g_LevelPatternState0768; on match advances pattern state by 2 with wrap at 0x12 and applies collision transition. | MEDIUM | MAP10 |
| `0000:612E` | `0x612E` | `Collision_SecondaryHitboxStopTargetVelocityX` | Uses the reserved/secondary hitbox rather than normal Bart body; on overlap resolves a linked target and zeros that target's horizontal velocity through StopLinkedTargetHorizontalVelocity. | MEDIUM | MAP10 |
| `0000:6167` | `0x6167` | `StopLinkedTargetHorizontalVelocity` | After a secondary-hitbox overlap, resolves the linked runtime target and zeros its horizontal velocity/state. | HIGH | MAP10 |
| `0000:617B` | `0x617B` | `Collision_IncrementSpecialCounter780IfReady` | Body AABB. Only when g_LevelEventGate0784==0, g_LevelProgress0766==0x0F and g_SpecialCounter0780!=4: increment counter0780 and set event gate 0784=0xFF. | MEDIUM | MAP10 |
| `0000:619F` | `0x619F` | `Collision_ConsumeCounter780AndMarkProgress` | Body AABB, then if g_SpecialCounter0780>0: decrement it, BCD-decrement goalsRemainingBCD, increment levelProgress0766 and mark the corresponding 10-byte progress-source record's flags 0x8000. | MEDIUM | MAP10 |
| `0000:61DB` | `0x61DB` | `Collision_BounceBartUpward` | Body AABB: sets Bart airborne and jump-state byte 0836=0xFF. If velocityY is not already faster upward than -0x0500, subtracts 0x0100 from current velocityY. This is a velocity-step bounce, distinct from StaticTerrain's fixed -0x0580 spring. | HIGH | MAP10 |
| `0000:61F8` | `0x61F8` | `Collision_SecondaryHitboxDamageAndLaunchObject` | Secondary hitbox collision. DamageLinkedTargetAndLaunchObject mutates linked/boss target state and launches/changes the current object. Depends on reserved action/secondary object state. | MEDIUM | MAP10 |
| `0000:6231` | `0x6231` | `DamageLinkedTargetAndLaunchObject` | Secondary-hitbox helper used by collision 41; mutates linked target/boss damage state and launches/changes the colliding object. | HIGH | MAP10 |
| `0000:6258` | `0x6258` | `Collision_SpecialObjectType8HitElseDamage` | Checks reserved action object type 8 against target; a valid secondary hit follows special target logic, otherwise body/hazard overlap can enter normal Bart damage. Secondary/action-object dependent. | MEDIUM | MAP10 |
| `0000:62DD` | `0x62DD` | `Collision_SpecialObjectType16DestroyAndAdvance` | Requires reserved action object type 0x10 with zero action velocities; on target hit destroys object and advances state 0817 through DestroyObjectAndAdvanceState817. Secondary/action-object dependent. | MEDIUM | MAP10 |
| `0000:631A` | `0x631A` | `DestroyObjectAndAdvanceState817` | Removes the struck object after AABB and advances the recovered level state byte 0817. | HIGH | MAP10 |
| `0000:6338` | `0x6338` | `Collision_MovingPlatformLandingWithDisplacement` | Special moving-platform landing variant. Uses its own vertical tolerance/offset rules and motionReferenceX displacement bookkeeping, updates Bart/base/platform contact state and carries Bart with object movement before transition. | HIGH | MAP10 |
| `0000:63C6` | `0x63C6` | `Collision_MovingHazardDamageOrLandingTransition` | Moving-object hybrid: depending approach/state can land/transition like a platform or start normal Bart damage/invulnerability. Uses object movement/reference fields and handler-specific geometry. | MEDIUM | MAP10 |
| `0000:6440` | `0x6440` | `Collision_RisingObjectActivateLinkedRecords` | Conditional rising-object/linked-record handler. When vertical/motion/state gates match, activates or marks linked source records and advances the associated sequence. Not a generic body AABB handler. | MEDIUM | MAP10 |
| `0000:6480` | `0x6480` | `Collision_SpecialObjectType8HitElseHazard` | If reserved action object type 8 satisfies its hit conditions, processes target transition/consume behavior; otherwise falls through to hazard/event handling. Secondary/action-object dependent. | MEDIUM | MAP10 |
| `0000:64E6` | `0x64E6` | `ApplyObjectCollisionTransition` | Collision transition adapter. Because TestBartObjectAABB_ContinueIfHit advances DI across xOffset/width/yOffset/height on a hit, DI points at CollisionProfile.parameter when this routine is entered. Reads that signed parameter and forwards nonzero values to ApplySignedCollisionTypeTransition. | HIGH | MAP10 |
| `0000:64F3` | `0x64F3` | `ApplySignedCollisionTypeTransition` | Core signed collision transition semantics. Negative parameter: award 100 score (0x90+0x10), trigger event/sound 7, decrement goalsRemainingBCD if nonzero, then negate the parameter. If the resulting value is odd, detach source + despawn. Otherwise set object.typeOffset to the even value, reload scriptPC from the current level script table and zero script delay/motion/fractions; also clears object flag 0x1000 and runtimeFlags bit0. Positive even values therefore retype/restart an object without the negative-parameter reward side effects. | HIGH | MAP10 |
| `0000:65B5` | `0x65B5` | `Collision_AirborneOnlyTransition` | Only while g_BartAirborne != 0: body AABB then ApplyObjectCollisionTransition. | HIGH | MAP10 |
| `0000:65C4` | `0x65C4` | `Collision_CollectInvulnerabilityPickup` | Body AABB pickup: awards 50 points, sets blinkPhase=0 and invulnerabilityTimer=0xFA (250), then detaches source and despawns. This is longer than normal post-hit invulnerability (0x64). | HIGH | MAP10 |
| `0000:65DC` | `0x65DC` | `Collision_TransitionObjectAndLaunch` | Body AABB -> signed collision transition, then uses low object-flag nibble as byte offset into CollisionLaunchVelocityTable. Clears low flag nibble, applies signed 8.8 velocityX/Y pair, and sets runtimeFlags 0x80 when launched horizontally. | HIGH | MAP10 |
| `0000:6618` | `0x6618` | `Collision_CollectExtraLife` | Body AABB pickup. AddScoreBCD(0x64) => 60 points, trigger event/sound 0x0D, increment g_LivesRemaining, clear runtime object and backing source active state. | HIGH | MAP10 |
| `0000:6650` | `0x6650` | `Collision_DamageBartOrTransitionObject` | Body AABB. After the AABB helper DI points to parameter: even nonzero => object transition and RETURN with no damage; odd => clear object flags then enter damage path; zero => damage path. Damage only starts when invulnerabilityTimer==0, calling BeginBartHitInvulnerability and setting hitDeathTimer=0x32. | HIGH | MAP10 |
| `0000:667A` | `0x667A` | `Collision_SecondaryHitboxBossDamage3` | Does NOT use Bart body AABB as the attacking shape. Builds a secondary/reserved hitbox from level/action state and, on overlap, subtracts 3 from boss HP via ApplyBossHelperHitDamage3; struck object is removed. Dependent on secondary action-object state. | MEDIUM | MAP10 |
| `0000:66B3` | `0x66B3` | `ApplyBossHelperHitDamage3` | AABB helper for collision 14: subtracts 3 from boss HP, sets event/defeated gate when HP <=0, and removes the striking object. | HIGH | MAP10 |
| `0000:66CE` | `0x66CE` | `Collision_GroundedOnlyTransition` | Only while g_BartAirborne == 0: body AABB then ApplyObjectCollisionTransition. | HIGH | MAP10 |
| `0000:66DC` | `0x66DC` | `Collision_DescendingAirborneTransition` | Requires Bart airborne and velocityY >= 0 (descending/not rising): body AABB then transition. | HIGH | MAP10 |
| `0000:66F1` | `0x66F1` | `Collision_TopContactBounceBreakOrDamage` | Custom top-contact path. Requires descending Bart and profile overlap. Depending object flags, can reflect Bart X/Y velocity, decrement a low-byte hit counter, award repeated 100-point chunks, transition the object, clear alternate flag 0x0400 and trigger event 5, or fall back to normal Bart damage when not safely bounced/broken. | HIGH | MAP10 |
| `0000:6817` | `0x6817` | `Collision_CollectObjectiveAndAdvanceSequence` | Body AABB objective pickup. Removes object, awards 100 score, triggers event 8, then advances the recovered objective/sequence indices and platform callback data; can mark a linked script/source record 0x8000 at a sequence boundary. | MEDIUM | MAP10 |
| `0000:6895` | `0x6895` | `Collision_ResolveHorizontalSolidCollision` | Body AABB horizontal solid. Suppressed by certain action/skateboard state. Resolves Bart to x=obj.x-0x10 when approaching from left or to obj.x+profile.xOffset+profile.width-2 when from right, and zeros horizontal velocity/related movement state. | HIGH | MAP10 |
| `0000:68DE` | `0x68DE` | `Collision_BartActionHitObject` | Only runs when g_BartActionActive != 0. Builds the facing-dependent Bart action/weapon hitbox from g_BartActionHitboxObject and tests it against the target profile. Can transition or destroy target depending parameter/state. There is intentionally no normal Bart-body fallback. Chat: handler 15 uses the separate Bart action/spray hitbox and low five object-flag bits as the remaining hit count, then applies the profile transition. | HIGH | MAP10+CHAT |
| `0000:697D` | `0x697D` | `Collision_SpecialObjectType2RegionTransition` | Checks reserved action object type 2 and a narrow region/state condition before applying the target object's collision transition. Secondary/action-object dependent. | MEDIUM | MAP10 |
| `0000:69AD` | `0x69AD` | `Collision_BartProjectileHitsBoss` | When level event gate permits and reserved action object is the projectile type, tests projectile hitbox against target; ApplyBossProjectileHitDamage1 decrements boss HP by 1 and removes projectile/updates boss state. Chat: boss hit requires an active reserved projectile with typeOffset=6, an 8x8 projectile AABB, and a live boss. Decrements boss counter 0896, sets 0784=FF at zero and destroys the projectile. Full browser boss behavior remains unfinished. | HIGH | MAP10+CHAT |
| `0000:69E3` | `0x69E3` | `ApplyBossProjectileHitDamage1` | Projectile/boss helper: decrements boss HP by 1, updates boss event state when depleted and removes/updates the projectile. | HIGH | MAP10 |
| `0000:6A07` | `0x6A07` | `Collision_SpecialObjectType4HitTransition` | Tests reserved action object type 4 against the target profile/region, then applies a transition and related action-state changes. Secondary/action-object dependent. | HIGH | MAP10 |
| `0000:6A6D` | `0x6A6D` | `Collision_SpecialObjectType10ClearIndexedFlag` | Requires reserved action object type 0x0A and matching region/AABB; clears an indexed level flag through ClearIndexedLevelFlagOnCollision and updates action object state. | MEDIUM | MAP10 |
| `0000:6AA6` | `0x6AA6` | `ClearIndexedLevelFlagOnCollision` | AABB helper used by action-object collision 25. Clears a level flag selected by target/action state. | HIGH | MAP10 |
| `0000:6AC7` | `0x6AC7` | `Collision_SpecialObjectType12ClearFlagAndCount` | Requires reserved action object type 0x0C; on hit clears/consumes a flagged objective and advances g_LevelCounter0813/state through ConsumeFlaggedObjectiveAndAdvanceState813. | MEDIUM | MAP10 |
| `0000:6B00` | `0x6B00` | `ConsumeFlaggedObjectiveAndAdvanceState813` | Runs the shared AABB test, then tests and clears GameObject.flags bit 0x1000. If that bit was set, awards 100 score (0x90 + 0x10), BCD-decrements g_GoalsRemainingBCD when nonzero, and increments DS:0813 when the post-AABB CollisionProfile.parameter equals the object's current typeOffset. Note: because TestBartObjectAABB_ContinueIfHit advances DI, older decompiler output may display this parameter read as profile.xOffset. | HIGH | MAP10 |
| `0000:6B47` | `0x6B47` | `Collision_LinkedObjectProximityTransition` | Finds another active runtime object by typeOffset, tests proximity/relationship to current target and conditionally performs a collision transition. Depends on linked runtime objects, not only Bart AABB. | MEDIUM | MAP10 |
| `0000:6B87` | `0x6B87` | `Collision_LinkedObjectSpecialTransition` | Linked-object special case using hardcoded position/type/state relationships, then applies a signed transition through ApplyCollisionTransitionFromBP. Keep tied to linked-object state; not a generic body collision. | LOW | MAP10 |
| `0000:6BF7` | `0x6BF7` | `ApplyCollisionTransitionFromBP` | Tiny wrapper that treats BP as a signed transition parameter and calls ApplySignedCollisionTypeTransition. | HIGH | MAP10 |
| `0000:6BFD` | `0x6BFD` | `Collision_CollectInventoryResource` | Body AABB inventory pickup. Uses profile.parameter as a DS counter address, prevents the capped 0780 special counter from exceeding 4, triggers event 2, despawns/unlinks source, BCD-increments the addressed counter, dispatches item-specific pickup effect, refreshes item HUD and starts the pickup-popup timer. | HIGH | MAP10 |
| `0000:6CEC` | `0x6CEC` | `Collision_ConsumeObjectAndTriggerEvent7` | Body AABB goal/object pickup. Awards 100 score via 0x90+0x10, triggers event 7, BCD-decrements goalsRemainingBCD when nonzero, then removes runtime object and source state. | MEDIUM | MAP10 |
| `0000:6D38` | `0x6D38` | `Collision_OneWayLandingAndOptionalTransition` | One-way top landing. Rejects rising Bart; tests Bart x+6 against object horizontal profile span. Allows at most 2 px penetration from above, snaps Bart Y to object.y+profile.yOffset, writes platformContactY, clears Vy/airborne. On first airborne landing, decrements LOW BYTE of object.flags if nonzero; only when it reaches zero is profile.parameter transition applied. | HIGH | MAP10 |
| `0000:6DC6` | `0x6DC6` | `Collision_LandOnMovingPlatform` | Moving one-way platform. Similar to handler 11 but allows only 1 px from above, ignores object flags bit0x80, always clears airborne/Vy, carries Bart horizontally by the signed integer delta derived from object velocityX+fractionX, then applies profile.parameter transition. | HIGH | MAP10 |
| `0000:6E50` | `0x6E50` | `Collision_ExternalCountdownTransition` | No normal body AABB. Reads configured external/source record; while its 0x8000 state is active decrements the low countdown byte and applies profile.parameter transition when the countdown reaches zero. Chat: WRENCH writes 803F to the configured source; C20 decrements its low byte and triggers T73->T74 at zero. Do not replace this with a body AABB. | MEDIUM | MAP10+CHAT |
| `0000:6E70` | `0x6E70` | `Collision_FeetOnlyDamageOrTransition` | Shifts Bart top down by 0x14 before the shared AABB/damage-transition path, effectively limiting the trigger to Bart's lower/feet zone. | HIGH | MAP10 |
| `0000:6E7A` | `0x6E7A` | `FeetOnlyDamageTransitionHelper` | Runs shared AABB with the caller-shifted Bart top, then enters the exact same parameter/damage semantics as collision handler 1. | HIGH | MAP10 |
| `0000:6E81` | `0x6E81` | `TestBartObjectAABB_ContinueIfHit` | Shared AABB primitive used by most collision handlers. Inputs are Bart edges in AX/BX/CX/DX, object in DS:SI, and DI pointing to CollisionProfile +2. It reads xOffset,width,yOffset,height while advancing DI. On a hit, execution returns to the caller with DI positioned at profile.parameter (+0A); callers then consume that parameter/transition. On a miss the helper uses the recovered continuation/unwind convention to skip the handler's hit path. This DI side effect is important: decompiler output can misleadingly display later parameter reads as profile.xOffset. | HIGH | MAP10 |

### core

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:005E` | `0x005E` | `GameStartup_Main` | Main startup/control entry. Initializes DOS/platform state, keyboard/joystick handling, presentation resources, menu/start selection, and ultimately enters RunLevelGameplayLoop. Also owns restart/error paths and the top-level overlay lifecycle. | HIGH | MAP10 |
| `0000:10B8` | `0x10B8` | `RestartMainProgramLoop` | Re-enters the main program/menu control loop after restart-worthy exits from gameplay/presentation. | HIGH | MAP10 |
| `0000:265B` | `0x265B` | `ProgramRestartLoop` | Restores saved stack/program state and routes back into startup/restart handling. This is the central recovery/restart trampoline. | HIGH | MAP10 |
| `0000:28FF` | `0x28FF` | `FatalErrorCleanupAndExit` | Common fatal-error cleanup/exit path: optionally prints an error, restores DOS interrupt/platform state and either terminates or routes into ProgramRestartLoop according to restart mode. | HIGH | MAP10 |
| `0000:2D18` | `0x2D18` | `InitializeLevelGameplayState` | Clears runtime objects, copies the current 0x78-byte LevelRuntimeConfig, initializes timer/HUD/goal state and calls ResetBartAndGameplayState. g_GoalsRemainingBCD is initialized from LevelRuntimeConfig +0x0E. The timer starts as swapped packed BCD 999 with an initial divider of 0x1E. | HIGH | MAP10 |
| `0000:2DFC` | `0x2DFC` | `LoadCurrentLevelResourcesAndConfig` | Copies the selected level's 0x78-byte LevelRuntimeConfig into DS:086E, performs level-1 variant adjustment (config +0x0E may be forced to BCD 20), and invokes platform graphics/resource setup callbacks. This function establishes all FAR pointers used later for sources, scripts, collision profiles, terrain and level-specific tables. | HIGH | MAP10 |
| `0000:33EC` | `0x33EC` | `AdvanceAndLoadNextLevel` | Advances current-level state, performs intro/overlay loading and installs the next level's runtime/config resources. | HIGH | MAP10 |

### debug

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:0000` | `0x0000` | `InvokeProMonIfInstalled` | Cached PRO-MON probe/invocation helper. Tests INT 60h once, remembers installed/not-installed state, and invokes the monitor only when present. This is debugging support, not gameplay logic. | HIGH | MAP10 |

### dos_io

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:26EA` | `0x26EA` | `ReadDiskNumberMarkerFile` | Opens disk.num through DOS INT 21h, reads its ASCII disk number marker, and returns the parsed value used by disk/overlay prompting. | HIGH | MAP10 |
| `0000:28E8` | `0x28E8` | `DiskCriticalErrorHandler` | INT 24h critical-error handler. Records that a disk error occurred and returns a DOS critical-error action code instead of performing gameplay work. | HIGH | MAP10 |

### gameplay

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:29B0` | `0x29B0` | `RunLevelGameplayLoop` | Top-level level runner and normal frame loop. Initializes global level state (lives=3, timer=999 BCD, inventory defaults), loads the selected level, then per frame executes in this recovered order: PollGameplayInput -> render-list swap -> UpdateGoalAndGateState -> UpdateBart -> UpdateBartActionAndWeaponState -> StreamAndUpdateLevelObjects -> BuildBartRenderObject -> UpdateGameplayTimers -> UpdateCameraHorizontal -> render services -> UpdateTerrainAndObjectWindowPointers -> ProcessBartObjectCollisions. Hit/death and level-complete states divert out of the normal loop. | HIGH | MAP10 |
| `0000:2BAF` | `0x2BAF` | `GameplayLoop_WaitForInputAndResume` | Alternate/resume gameplay entry. Waits for nonzero gameplay input, then executes the same Bart/object/render/window/collision ordering as the normal frame loop. | HIGH | MAP10 |
| `0000:588A` | `0x588A` | `UpdateGameplayTimers` | Updates transient gameplay timers, HUD popup/message timing and inventory/action timing, and calls HUD status refresh where required. | MEDIUM | MAP10 |
| `0000:6EB3` | `0x6EB3` | `UpdateGoalAndGateState` | Per-frame global timer/goal gate update. Timer zero forces g_BartHitDeathTimer=0x32 and enters the hit/death path. Otherwise g_LevelTimerTickDivider decrements and reloads to 0x23; on reload it BCD-decrements the swapped timer. When goalsRemainingBCD reaches zero, sets the one-shot goal-completion state, displays the level message (except level 5) and activates/changes the configured gate/source progression. Chat v0.9.6: zero goals remove Level-1 barricade source #123 and any resident object, allowing Nelson source #125 to stream. This is separate from the later boss arena lock. | HIGH | MAP10+CHAT |

### hud

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:2F73` | `0x2F73` | `DrawAnimatedLevelHudIcon` | Draws the small animated HUD icon only when its selected frame/state differs from the redraw cache. | MEDIUM | MAP10 |
| `0000:2F9A` | `0x2F9A` | `UpdateHudStatusFields` | Cached HUD updater. Common fields are processed in this order: goals remaining (packed BCD), level timer (swapped packed BCD), lives, then six-digit packed-BCD score; afterwards a current-level jump table updates level-specific meters/cells. The cache avoids unnecessary redraw calls. | HIGH | MAP10 |
| `0000:324C` | `0x324C` | `DrawHudPipMeterFill` | Draws AX filled pips using the fixed pip X-offset table. Used by the level-specific action meters. | HIGH | MAP10 |
| `0000:328B` | `0x328B` | `ClearHudPipMeter` | Clears/redraws the six-pip meter background at the fixed pip positions. | HIGH | MAP10 |
| `0000:32A1` | `0x32A1` | `UpdateInventoryItemHud` | Uses itemIndex to select inventory metadata, redraws the corresponding count/icon state, and is called by pickups, item consumption and inventory selection. | HIGH | MAP10 |
| `0000:33B9` | `0x33B9` | `InitializeHudFrameGraphics` | Issues the fixed platform graphics calls that establish the gameplay HUD frame. | MEDIUM | MAP10 |
| `0000:34DD` | `0x34DD` | `DrawCStringAtTextPosition` | Draws a NUL-terminated DS:SI string at the supplied text position using the platform text primitive. | HIGH | MAP10 |
| `0000:768D` | `0x768D` | `UpdateHudPopupState` | Dispatches the transient HUD/inventory popup state machine and lifetime counters. | MEDIUM | MAP10 |
| `0000:76F9` | `0x76F9` | `EndHudOverlay` | Thin platform wrapper that closes/ends the active HUD/text overlay. | MEDIUM | MAP10 |
| `0000:76FF` | `0x76FF` | `BeginHudOverlay` | Thin platform wrapper that begins/opens the HUD/text overlay. | MEDIUM | MAP10 |

### input

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:004E` | `0x004E` | `WaitForActionButtonRelease` | Polls the platform/frame service until the gameplay action/fire input is released. Used as an input edge/debounce barrier around menus and presentation transitions. | HIGH | MAP10 |
| `0000:0554` | `0x0554` | `CheckCheatCodeKeySequences` | Advances the two keyboard cheat-sequence state machines. Successful sequences set the 0xAC sentinel flags later consumed by gameplay/death logic. Chat: COWABUNGA sets 06F9=AC (unlimited lives); keypad-minus + EATMYSHORTS sets 06FA=AC (unlimited lives and F = level completion). The original reader runs in startup/presentation. | HIGH | MAP10+CHAT |
| `0000:05E9` | `0x05E9` | `UpdateJoystickCalibrationCursor` | Converts raw gameport axes relative to calibration center into movement of the on-screen calibration sight/cursor; clamps the cursor to the calibration area. | HIGH | MAP10 |
| `0000:0663` | `0x0663` | `FinalizeJoystickCalibration` | Captures joystick extrema, derives thresholds/deadzones, and finalizes the calibration state consumed by PollJoystickInput. | HIGH | MAP10 |
| `0000:070E` | `0x070E` | `ComputeJoystickAxisThresholdPair` | Joystick calibration helper. Input BX is one raw axis sample. Returns DX=sample/2 and AX=sample + (g_JoystickTimingLoopCount-sample)/2, i.e. the midpoint between the sample and the calibrated timing-loop maximum. FinalizeJoystickCalibration calls it for the four axis extrema to derive threshold/deadzone pairs. | HIGH | MAP10 |
| `0000:0721` | `0x0721` | `ShowJoystickCalibrationInstructions` | Initializes the joystick-calibration instruction text stream: points the presentation cursor at the calibration text block, clears presentation delays, sets calibration phase=1 (center capture), enables joystick polling and returns to the startup calibration state machine. | HIGH | MAP10 |
| `0000:07B5` | `0x07B5` | `CaptureJoystickCenterCalibration` | Samples joystick axes for the center position and seeds the calibration structure before extrema capture. | HIGH | MAP10 |
| `0000:089E` | `0x089E` | `CreateJoystickCalibrationSight` | Builds the transient render object used for the joystick calibration sight. | HIGH | MAP10 |
| `0000:2979` | `0x2979` | `KeyboardIRQ1_Handler` | IRQ1/INT 09h keyboard ISR. Reads scan codes from port 60h and maintains g_KeyStateTable, including make/break state used by menus, cheats and gameplay. | HIGH | MAP10 |
| `0000:34F6` | `0x34F6` | `PollJoystickInput` | Reads calibrated joystick axes/buttons and converts them into the same gameplay input-bit representation used by keyboard input. | HIGH | MAP10 |
| `0000:3555` | `0x3555` | `PollGameplayInput` | Merges keyboard and joystick state into g_GameplayInputBits. These bits drive horizontal movement, jump/action and inventory/action logic. | HIGH | MAP10 |
| `0000:37C8` | `0x37C8` | `ReadJoystickGameportAxes` | Direct port-201h gameport read. Measures four axis discharge times and returns button/axis state in the recovered register tuple. | HIGH | MAP10 |

### inventory

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:6C66` | `0x6C66` | `DispatchInventoryPickupEffect` | Maps a DS inventory-counter address (0772-based) to the 14-entry pickup-effect jump table. Only items with a nonzero callback receive extra side effects beyond the generic BCD increment/HUD update. | HIGH | MAP10 |
| `0000:6CA6` | `0x6CA6` | `InventoryPickupEffect_Item02_ThresholdExtraLife` | Item-2 pickup effect. Adds 50 score. When the packed item count reaches the threshold above 0x14, subtracts 0x10 from the item count and increments g_LivesRemaining using the common BCD increment helper. This implements the collectible-threshold extra-life reward. | HIGH | MAP10 |
| `0000:6CC5` | `0x6CC5` | `InventoryPickupEffect_Item03_PrimeLevel1Meter` | Item-3 pickup effect. If the item-3 count is still below 2, primes the Level-1 action meter DS:0815 to 0x1B; later Level-1 action/HUD logic consumes that meter. | HIGH | MAP10 |
| `0000:6CD2` | `0x6CD2` | `InventoryPickupEffect_Item10_PrimeLevel3Meter` | Item-10 pickup effect. If its count is still below 2, primes the Level-3 action meter DS:0782 to 0x0C. | HIGH | MAP10 |
| `0000:6CDF` | `0x6CDF` | `InventoryPickupEffect_Item11_PrimeLevel4Meter` | Item-11 pickup effect. If its count is still below 2, primes the Level-4 action meter DS:0781 to 0x0C. | HIGH | MAP10 |
| `0000:7369` | `0x7369` | `UpdateInventorySelection` | Handles inventory selection/activation input, wraps through available items, consumes item counters where appropriate and updates the popup/HUD selection state. Chat: hold A/Down, tap Space to cycle stocked inventory items; releasing A dispatches the selected item. Repeat/debounce state uses 07D6. | HIGH | MAP10+CHAT |
| `0000:7771` | `0x7771` | `DrawInventoryPopup` | Draws the inventory popup frame, current selector and item/count presentation. | HIGH | MAP10 |

### level

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:2F26` | `0x2F26` | `InitializeLevelSpecificResources` | One-time per-level initialization dispatcher for level-specific resource/state hooks after the common config has been loaded. | MEDIUM | MAP10 |
| `0000:7BFC` | `0x7BFC` | `BackupLevelMutableDataForReset` | Copies the current level's mutable embedded EXE block to the scratch backup segment. The per-level lengths are used later to restore destructive source/progression mutations after game over/reset. | HIGH | MAP10 |
| `0000:7C51` | `0x7C51` | `RestoreLevelMutableDataForReset` | Restores the current level's mutable embedded EXE block from the scratch backup, reversing source/progression mutations made during gameplay. | HIGH | MAP10 |

### level1

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:38EC` | `0x38EC` | `LevelSpecificPlayer_Level1` | Level-1 per-frame player rules: world-region gates, special-sequence dispatch and level-1 boss/progression interactions layered around the common Bart update. Chat: skateboard region is 0D6C <= BartX < 2180. Outside it, Q/Up at the three storefront cells starts the 07F1/07F2 shop sequence when Bart is stationary at Y=007A. | HIGH | MAP10+CHAT |
| `0000:4C09` | `0x4C09` | `Level1_DispatchSpecialSequenceState` | Indirect near dispatch for DS:07F1 through Level1SpecialSequence_JumpTable at CS:4C18. LevelSpecificPlayer_Level1 tail-enters it when 07F1 is nonzero; target states coordinate Level-1 special encounters/sequences and associated object/source mutations. Chat: this sequence is the Level-1 storefront/shop interaction: four transient objects, O/P selection, Space purchase, A exit, packed-BCD coins/inventory and binary shop stock. | HIGH | MAP10+CHAT |

### level1 natives

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `096D:30D2` | `0xC7A2` | `Level1_RandomStep` | Level-1 native PRNG step at 096D:30D2. Advances the level/native random state and returns the value used by Level-1 scripted callbacks. | HIGH | MAP10 |
| `096D:3117` | `0xC7E7` | `Level1Native_SetObjectFlag1000` | FAR callback at 096D:3117 invoked through Script_CallNativeFar. ES:BX=current GameObject. Sets object.flags bit 0x1000 and returns without consuming inline script data. | HIGH | MAP10 |
| `096D:311D` | `0xC7ED` | `Level1Native_SetObjectLinkField2A` | FAR callback at 096D:311D. Reads one u16 from DS:SI, advances SI by 2 and stores the value in GameObject.parentObject/+2A. This proves CallNativeFar callbacks can consume inline script operands and return an updated script cursor. | HIGH | MAP10 |
| `096D:3127` | `0xC7F7` | `Level1Native_ToggleFlag1000AndCountdownField2A` | FAR callback at 096D:3127. Toggles object.flags bit 0x1000, decrements GameObject.parentObject/+2A as a countdown, and when it reaches zero advances SI by an additional four bytes. Control-flow effect is therefore conditional inline-script skipping. | HIGH | MAP10 |
| `096D:313C` | `0xC80C` | `Level1Native_RegisterCurrentObjectAsBoss` | FAR callback at 096D:313C. Stores the current ES:BX GameObject as the registered boss/linked-target FAR pointer in DS:079D/079F. Several secondary-hitbox collision handlers later resolve this target. | HIGH | MAP10 |
| `096D:3147` | `0xC817` | `Level1Native_NelsonChooseAttackOrDeath` | FAR callback at 096D:3147. If the recovered boss-defeated/event byte is set, replaces SI with death script 0x23A8. Otherwise advances the Level-1 RNG and, for one random branch, skips four inline script bytes. This callback is both state- and control-flow-changing. | HIGH | MAP10 |
| `096D:315F` | `0xC82F` | `Level1Native_ToggleLevelFinishedFlag` | FAR callback at 096D:315F. Bitwise-NOTs DS:0783 (the byte otherwise used as g_LevelFinished in the main gameplay loop). Mechanical effect is certain; call-site intent is a Level-1 special-sequence completion toggle. | MEDIUM | MAP10 |
| `096D:3165` | `0xC835` | `Level1Native_BranchAtTimer400Or200` | FAR callback at 096D:3165. Tests the swapped packed-BCD level timer for words 0x0004 or 0x0002 (400/200-second milestones in this storage order). On either milestone advances SI by four bytes, selecting the alternate inline script branch. Chat: T90 uses this timer branch to spawn T91 at 4:00/2:00. It is a passer-by controller, not Nelson and not proof of a cinema bonus screen. | HIGH | MAP10+CHAT |
| `096D:3179` | `0xC849` | `Level1Native_BranchIfType67AtRecord0599` | FAR callback at 096D:3179. Reads the mutable Level-1 record at DS:0599+6; if its typeOffset is 0x0086 (type 67), advances SI by four bytes. This is a script branch keyed by persistent level-object state. | MEDIUM | MAP10 |
| `096D:3187` | `0xC857` | `Level1Native_SelectRandomScriptFromTable` | FAR callback at 096D:3187. Advances Level1_RandomStep, masks the result with 7, and replaces/returns SI from one of eight u16 script offsets in the table at 096D:16FB. This is an explicit random script-control transfer. | HIGH | MAP10 |
| `096D:3198` | `0xC868` | `Level1Native_SetRandomVelocityX` | FAR callback at 096D:3198. Advances Level1_RandomStep, masks with 7 and writes GameObject.velocityX from the eight-entry signed 8.8 velocity table at 096D:16EB. | HIGH | MAP10 |
| `096D:31AD` | `0xC87D` | `Level1Native_SetAccelYFromBartDistance` | FAR callback at 096D:31AD. Computes object.x - g_BartX, quantizes the distance in 32-pixel bands and selects GameObject.accelerationY from the Level-1 table at 096D:16DB. Used for distance-shaped vertical motion. | HIGH | MAP10 |
| `096D:31CB` | `0xC89B` | `Level1Native_SetRuntimeFlag0080` | FAR callback at 096D:31CB. Sets GameObject.runtimeFlags bit 0x0080. The same transient bit participates in launched/moving object behavior elsewhere in the runtime. | HIGH | MAP10 |
| `096D:31D2` | `0xC8A2` | `Level1Native_SetLocalEventFlag` | FAR callback at 096D:31D2. Sets the Level-1 local native event byte at CS:31E5 to 1. This storage overlaps unrelated labels in older analysis; treat it as callback-local state in this context. | HIGH | MAP10 |
| `096D:31D9` | `0xC8A9` | `Level1Native_BranchIfLocalEventFlagSet` | FAR callback at 096D:31D9. Tests the Level-1 local event byte at CS:31E5 and advances SI by four bytes when set, selecting the alternate inline script path. | HIGH | MAP10 |

### level2

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:3A1A` | `0x3A1A` | `LevelSpecificPlayer_Level2` | Level-2 per-frame player rules, including fall/death regions. Some paths explicitly set g_BartHealthCounter=0 and enter the shared hit/death handler. | HIGH | MAP10 |

### level3

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:3A75` | `0x3A75` | `LevelSpecificPlayer_Level3` | Level-3 per-frame player rules: area transitions, puzzle/action state and level-specific checkpoints/world-section logic. | HIGH | MAP10 |
| `0000:3BBB` | `0x3BBB` | `Level3_CheckAreaTransition` | Tests Bart position and level-3 transition state to decide whether to rebase the active world section. | MEDIUM-HIGH | MAP10 |
| `0000:3C2F` | `0x3C2F` | `Level3_DispatchSpecialSequenceState` | Indirect near dispatch for the even-valued Level-3 special-sequence byte DS:07EF. Uses the state value as a byte offset into the Level3SpecialSequence_JumpTable at CS:3C3E; individual state handlers own puzzle/transition side effects. Treat 07EF as a state-machine selector, not a generic counter. | HIGH | MAP10 |
| `0000:3F3D` | `0x3F3D` | `Level3Special_State02` | Level-3 special-state 0x02 cleanup/advance step. Iterates eight configured 10-byte source records, finds and removes any matching live object in the 28-slot runtime pool, writes source flags/state byte +9 = 0x90, then fills the 10-byte Level-3 pattern/reset state block with 0xFF, advances g_Level3SpecialState07EF by 2 and clears its substate byte 07F0. | Not graded | MAP10 |
| `0000:4125` | `0x4125` | `Level3_AddFiveItem02AndAwardLife` | Packed-BCD increments inventory item 2 five times. At threshold 0x15 it subtracts 0x10 and increments g_LivesRemaining. | HIGH | MAP10 |
| `0000:4150` | `0x4150` | `Level3_StartInteractionMessage` | Selects and initializes the level-3 interaction message state, including already-used/no-item branches and movement/text locks. | MEDIUM-HIGH | MAP10 |
| `0000:41D3` | `0x41D3` | `Level3_UpdatePatternPuzzle` | Drives the recovered level-3 pattern puzzle: consumes pattern bits/state, updates special source records and controls related text/progression state. | MEDIUM-HIGH | MAP10 |
| `0000:4320` | `0x4320` | `Level3_ApplyPatternToSourceRecords` | Applies the current nine-byte Level-3 puzzle pattern to grouped mutable LevelObjectSource records. First despawns any live runtime instances backed by those sources, then rewrites selected source flag nibbles from the pattern bytes across three source groups. This is persistent level-data mutation; later streaming recreates objects with the updated pattern state. | HIGH | MAP10 |
| `0000:43CF` | `0x43CF` | `Level3_TogglePatternBitsFromTable` | Uses the supplied table index to select a short list of byte offsets from the Level-3 toggle table at CS:0512. Each nonnegative offset toggles bit0 of patternBase[offset]; a negative table byte terminates the list. This is the puzzle-input transform applied before source records are rebuilt. | HIGH | MAP10 |
| `0000:43EE` | `0x43EE` | `Level3_ResetPatternSourceRecords` | Iterates the level-3 special LevelObjectSource records and restores their mutable flags/state for the pattern puzzle. | HIGH | MAP10 |
| `0000:442E` | `0x442E` | `Level3_UpdateZoneTraversalAndTransitions` | Level-3 zone-navigation state machine. Selects one of four zone descriptors from Bart X, constrains/rewrites Bart X/Y and action state while traversing special vertical sections, consumes directional input at zone boundaries, updates the zone-specific vertical limit/reference and triggers section-transition/reposition logic when Bart crosses descriptor thresholds. This routine is one of the reasons Level 3 cannot be modeled as a single flat horizontal world. | MEDIUM-HIGH | MAP10 |
| `0000:45A1` | `0x45A1` | `Level3_TransitionWorldSectionAndResumeGameplay` | Rebases Bart/camera between large level-3 world sections, rebuilds streaming pointers/objects and returns to gameplay. | HIGH | MAP10 |
| `0000:7B58` | `0x7B58` | `GetLevel3RespawnCheckpoint` | Level-3 checkpoint lookup. Walks the level-3 X-threshold table using current Bart X and returns cameraX in AX plus Bart-relative X in BX (0 or 0x88 depending on the selected checkpoint entry). | MEDIUM | MAP10 |

### level4

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:462F` | `0x462F` | `LevelSpecificPlayer_Level4` | Level-4 per-frame player rules and level-specific action/progression handling. | HIGH | MAP10 |

### level5

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:4682` | `0x4682` | `LevelSpecificPlayer_Level5` | Level-5 per-frame player rules and primary/secondary special-sequence dispatch. | HIGH | MAP10 |
| `0000:4783` | `0x4783` | `Level5Special_SharedState16_22` | Shared implementation reached by multiple Level-5 primary special states (including 0x16/0x22), updating sequence timers/descriptors and spawned/runtime state. | Not graded | MAP10 |
| `0000:4790` | `0x4790` | `Level5Special_State02` | Recovered Level-5 primary special-sequence state 0x02. Selects descriptor/spawn behavior and advances its state machine. | Not graded | MAP10 |
| `0000:4B02` | `0x4B02` | `Level5_ReadSequenceDescriptorField3C` | Returns the word at offset +0x3C from the currently selected Level-5 sequence descriptor (SI). Caller stores the result in DS:07A5 while constructing the next Level-5 sequence object/state. | HIGH | MAP10 |
| `0000:4B50` | `0x4B50` | `Level5_DispatchSecondarySequenceState` | Indirect near dispatch for DS:07F5 through Level5SecondarySequence_JumpTable. LevelSpecificPlayer_Level5 enters this dispatcher whenever the secondary sequence state is nonzero; the target states drive special Level-5 traversal/object/presentation mechanics. | HIGH | MAP10 |

### objects

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:2DEC` | `0x2DEC` | `ClearRuntimeObjectStorage` | Resets render-list sentinels then clears 0x600 bytes covering the runtime/render-object storage region. | HIGH | MAP10 |
| `0000:439F` | `0x439F` | `DespawnRuntimeObjectForSourceRecord` | Scans the fixed 28-slot runtime object pool for an active GameObject whose sourceRecord equals the supplied LevelObjectSource offset. On match clears the runtime object's flags and clears source flag 0x4000 (linked/live instance), then returns. Used before Level-3 puzzle code mutates persistent source records. | HIGH | MAP10 |
| `0000:4410` | `0x4410` | `DespawnRuntimeObjectBySourcePointer` | Searches the 28 runtime slots for the object backed by a supplied source-record pointer and despawns/unlinks that runtime instance. | HIGH | MAP10 |
| `0000:593E` | `0x593E` | `StreamAndUpdateLevelObjects` | Core 28-slot object streamer/updater. Streams sorted 10-byte LevelObjectSource records into GameObject slots. For each active object: decrement scriptDelay as uint16; if its signed 16-bit value is negative, enter RunObjectScriptVM; unless despawned, then integrate X and Y signed 8.8 motion, step animation timer/frame, compute renderOffset=animBase+animFrame*12, optionally add 0x48 when alternate-graphics mode is active and object flags include 0x0400, and set runtimeFlags bit0. Source flag 0x4000 tracks linkage to a live runtime instance. | MEDIUM | MAP10 |
| `0000:5B74` | `0x5B74` | `AdvanceToNextRuntimeObject` | Clears transient runtimeFlags bit0 for the current object and advances the 0x30-byte slot cursor inside StreamAndUpdateLevelObjects. | HIGH | MAP10 |
| `0000:6578` | `0x6578` | `DetachSourceAndDespawnObject` | Clears the backing source record's linked/active state, zeroes source pointer/segment, object flags and runtime flags. Used for persistent pickup/object removal. | HIGH | MAP10 |
| `0000:6596` | `0x6596` | `FindRuntimeObjectByTypeOffset` | Scans the 28 runtime slots for an active object with the requested typeOffset and returns its slot pointer in BP/register-return form. | HIGH | MAP10 |
| `0000:7807` | `0x7807` | `AllocateTransientGraphicObject` | Allocates from the same fixed 28-slot GameObject pool used by level objects; there is no heap allocation. Scans for flags==0 and initializes the selected slot as a transient graphic object (flags/typeOffset 0x8000, caller-supplied X/Y/render selector, resource segment in ES, no persistent source, zero script delay/motion/fractions/runtimeFlags). Used by joystick/presentation and special gameplay graphics. | HIGH | MAP10 |
| `0000:7818` | `0x7818` | `InitializeTransientGraphicObject` | Initializes an already-selected GameObject slot as a transient graphic object: flags/typeOffset=0x8000, supplied X/Y/render selector, resource/source segment from ES, sourceRecord=0, and all script-delay/motion/fraction/runtime state zeroed. Returns the same GameObject pointer. | HIGH | MAP10 |
| `0000:7BA0` | `0x7BA0` | `PrepareLevelObjectsForRespawn` | Advances/streams level objects repeatedly, resets source-window cursors and removes transient runtime objects lacking a persistent source in preparation for respawn. | HIGH | MAP10 |

### overlay

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:12B9` | `0x12B9` | `EnsureCommonPresentationOverlayLoaded` | Ensures the shared General/Pictures presentation overlay is resident. When subsystem flag 0x10 is clear, chooses the overlay filename from g_ResourceVariantMode, loads it through LoadOverlayViaDosExec, records the loaded flag/calls the platform setup entry when appropriate, then refreshes g_LargestFreeDosBlockParagraphs through DOS memory-query service. | MEDIUM | MAP10 |
| `0000:12F9` | `0x12F9` | `UnloadCommonPresentationOverlay` | Unloads/releases the common presentation overlay when its loaded-state flag is set. | HIGH | MAP10 |
| `0000:2840` | `0x2840` | `LoadCurrentLevelOverlay` | Selects LEVEL1.OVL..LEVEL5.OVL from g_CurrentLevel and loads it through the DOS EXEC overlay path. | HIGH | MAP10 |
| `0000:2899` | `0x2899` | `LoadOverlayViaDosExec` | DOS INT 21h AX=4B00 EXEC wrapper. Saves/restores stack context around overlay execution and captures the resident overlay interface published by the child TSR. | HIGH | MAP10 |

### presentation

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:08BF` | `0x08BF` | `RunLevelIntroPresentation` | Pre-level presentation path. Loads/selects level resources, initializes graphics state and text presentation, then hands control to the gameplay setup path. | HIGH | MAP10 |
| `0000:0A71` | `0x0A71` | `RunGameOverPresentation` | Game-over presentation/return path. Restores mutable level data as needed, tears down gameplay-facing state, and drives the game-over text/graphics sequence. | HIGH | MAP10 |
| `0000:1050` | `0x1050` | `RunGameEndingSequence` | Ending/credits presentation reached after the final level completion path. | HIGH | MAP10 |
| `0000:10BE` | `0x10BE` | `StepTextPresentation` | Interpreter for common presentation text/control bytes. Advances cursor/state and issues platform text/graphics callbacks. | HIGH | MAP10 |
| `0000:119C` | `0x119C` | `StepLevelPresentationText` | Level-specific companion text interpreter used by intro/game-over presentation state. | HIGH | MAP10 |
| `0000:7BD9` | `0x7BD9` | `EnterGameOverSequence` | Final game-over path after lives reach zero: performs display transition, restores mutable level data, clears gameplay input/action state and jumps to the game-over presentation. | HIGH | MAP10 |

### render

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:2DCB` | `0x2DCB` | `ResetObjectRenderListSentinels` | Resets both render-list buffers to 0xFFFF sentinels. Called by level initialization, object-storage clearing and certain world-transition paths. | HIGH | MAP10 |

### rng

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:3CE5` | `0x3CE5` | `StepDeterministicRngState` | Advances the shared deterministic two-word pseudo-random state used by level-specific scripted/native behavior. | HIGH | MAP10 |

### score

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:36D4` | `0x36D4` | `AddScoreBCD` | Adds a compact score amount code to the six-digit packed-BCD score. Codes 0..9 add units; codes >=0x10 use the HIGH nibble as tens (e.g. 0x50=50, 0x64=60 because the low nibble is ignored, 0x90=90). Overflow of the low four digits increments the high score word. | HIGH | MAP10 |

### script_vm

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:5AB9` | `0x5AB9` | `RunObjectScriptVM` | Direct-threaded object VM. SI is loaded from obj.scriptPC; each nonzero word is a near handler address and is jumped to directly. A zero handler word is the Wait sentinel: the following word becomes obj.scriptDelay, the post-operand SI is stored back to obj.scriptPC, and the VM yields to normal motion/animation. Native FAR handlers may alter SI/control flow, so their semantics must not be reduced to ordinary fallthrough without evidence. | HIGH | MAP10 |
| `0000:5B99` | `0x5B99` | `Script_PlaySound` | Reads u16 sound/event ID, calls platform event/sound service, advances SI by 2 and continues VM. | HIGH | MAP10 |
| `0000:5BA6` | `0x5BA6` | `Script_SetAnimation` | Operands: u16 animBase, u16 frameCount, u16 reloadTicks. Writes animBase/count, animTimer=animReload=reloadTicks, animFrame=0; continues VM. The normal object post-update later decrements animTimer on the SAME tick and computes renderOffset=animBase+frame*12. | HIGH | MAP10 |
| `0000:5BCA` | `0x5BCA` | `Script_SetStaticFrame` | Operand: raw u16 animBase/render selector. Writes animBase=value, frameCount=1, animTimer=1, animReload=0xFFFF, animFrame=0; continues VM. Store the operand verbatim. V10 asset/runtime validation found special unaligned values (for example Level-1 0x0075) used by the original resource/render path; tooling must not normalize the VM operand at write time. | HIGH | MAP10 |
| `0000:5BEE` | `0x5BEE` | `Script_Goto` | Operand u16 target. Replaces SI/script cursor with target and continues there. This is script control flow, never world movement. | HIGH | MAP10 |
| `0000:5BF3` | `0x5BF3` | `Script_SetVelocityX` | Operand signed 8.8. Writes velocityX and seeds the LOW BYTE of fractionX from the raw velocity value, matching the original fixed-point accumulator behavior. | HIGH | MAP10 |
| `0000:5C03` | `0x5C03` | `Script_SetVelocityY` | Operand signed 8.8. Writes velocityY and seeds the LOW BYTE of fractionY from the raw velocity value. | HIGH | MAP10 |
| `0000:5C13` | `0x5C13` | `Script_SetAccelerationX` | Operand signed 8.8 accelerationX; fallthrough. | HIGH | MAP10 |
| `0000:5C1F` | `0x5C1F` | `Script_SetAccelerationY` | Operand signed 8.8 accelerationY; fallthrough. | HIGH | MAP10 |
| `0000:5C2B` | `0x5C2B` | `Script_DetachSource` | Clears runtime sourceRecord/sourceRecordSegment; if a source existed, clears its persistent linked/active field. Object remains active and VM continues. | HIGH | MAP10 |
| `0000:5C4B` | `0x5C4B` | `Script_Despawn` | Clears object flags, clears source linkage flag 0x4000 when backed by a source, and jumps directly to AdvanceToNextRuntimeObject so no motion/animation post-update runs for the despawned object. | HIGH | MAP10 |
| `0000:5C6C` | `0x5C6C` | `Script_SetTypeAndPersistY` | Operand u16 typeOffset. Changes runtime typeOffset and writes current object Y back into the persistent source record; continues VM. | HIGH | MAP10 |
| `0000:5C83` | `0x5C83` | `Script_ExternalSpecial3Bytes` | Consumes exactly three inline script bytes; when alternate-graphics mode is inactive it invokes an external/platform helper first. Semantics of those three bytes remain platform/level-specific; do not reinterpret them as ordinary VM words. Chat v0.9.6: T38/T39 and T73/T74 use 04 04 0D / 04 0A 06. The browser models the latter as a red palette remap; the full platform render command is not claimed pixel-exact. | LOW | MAP10+CHAT |
| `0000:5C99` | `0x5C99` | `Script_GotoIfXAtOrRightOfBart` | Compares object.x with g_BartX. If object.x >= Bart.x, tail-enters Script_Goto using the inline u16 target; otherwise skips that target operand and continues. | HIGH | MAP10 |
| `0000:5CAD` | `0x5CAD` | `Script_SetSourceTypeFlags` | Writes inline type/flag words into the backing LevelObjectSource. Mutates persistent level data rather than only the runtime GameObject. | HIGH | MAP10 |
| `0000:5CC2` | `0x5CC2` | `Script_StopMotion` | Zeros velocityX/Y, accelerationX/Y and fractionX/Y; continues VM. | HIGH | MAP10 |
| `0000:5CDF` | `0x5CDF` | `Script_WaitUntilYAtLeast` | Conditional yield/retry opcode. Tests object Y against inline threshold/flow data; on the waiting path stores script state and yields instead of busy-looping inside one VM call. | HIGH | MAP10 |
| `0000:5CF9` | `0x5CF9` | `Script_SetGlobalEventData` | Copies six inline words (12 bytes) into the recovered global event/state block; continues VM. | HIGH | MAP10 |
| `0000:5D06` | `0x5D06` | `Script_DecrementObjectiveCounterBCD` | BCD-decrements the objective/goals counter and advances VM. This opcode participates in the same goals state shown by UpdateHudStatusFields/UpdateGoalAndGateState. | HIGH | MAP10 |
| `0000:5D21` | `0x5D21` | `Script_BounceSlowdownStep` | Motion helper opcode implementing the original small bounce/slowdown step with conditional yield/retry behavior. Preserve its fixed-point/state-machine semantics rather than replacing it with generic damping. | MEDIUM | MAP10 |
| `0000:5D66` | `0x5D66` | `Script_SpawnChild` | Allocates a free GameObject from the same 28-slot pool, initializes parent/link and child type/script state, and can select one of the recovered signed 8.8 launch velocities. Yields when no slot is available rather than allocating dynamically. | HIGH | MAP10 |
| `0000:5E1B` | `0x5E1B` | `Script_SetLevelCameraState` | Writes two inline words into recovered level/camera state globals; continues VM. Chat: writes 07A1/07A9 and camera/world bounds; negative mode uses limit 5000, otherwise target+012C. Nelson uses this to lock the boss arena. | HIGH | MAP10+CHAT |
| `0000:5E56` | `0x5E56` | `Script_TriggerGlobalEventSound4` | Triggers the recovered global event/sound service with event ID 4 and continues. | MEDIUM | MAP10 |
| `0000:5E7F` | `0x5E7F` | `Script_SetGlobalRange` | Writes two inline words to the recovered global range pair; continues. | MEDIUM | MAP10 |
| `0000:5E98` | `0x5E98` | `Script_SetObjectFlag1000` | Sets GameObject.flags bit 0x1000; continues. | HIGH | MAP10 |
| `0000:5EA0` | `0x5EA0` | `Script_ClearObjectFlag1000` | Clears GameObject.flags bit 0x1000; continues. | HIGH | MAP10 |
| `0000:5EAF` | `0x5EAF` | `Script_SetGlobalTargets` | Writes two inline target words to recovered globals; continues. | MEDIUM | MAP10 |
| `0000:5EC4` | `0x5EC4` | `Script_SpawnChildAfterCurrent` | SpawnChild variant with ordering/current-object linkage differences; shares the fixed 28-slot allocation model. | MEDIUM | MAP10 |
| `0000:5EE1` | `0x5EE1` | `Script_CallNativeFar` | Reads inline FAR offset:segment, stores the call target globals and performs the level-native callback. Native code may consume inline data, mutate object/global state and alter SI/control flow. Treat it as an extension opcode boundary, not guaranteed fallthrough. | HIGH | MAP10 |

### story

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:7903` | `0x7903` | `RunLevelCompleteSequence` | Level completion flow. Converts remaining timer into score, updates HUD/presentation, performs level-complete animation/state and then advances toward the next level/ending. | HIGH | MAP10 |

### terrain

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:4DCA` | `0x4DCA` | `CheckStaticTerrainLanding` | Scans active 6-byte StaticTerrain records. Tests Bart center-X (x+8) and descending vertical crossing against surfaceY-30. On normal contact snaps Bart Y and clears airborne/Vy; bit15 on yAndFlags makes the surface a spring/bounce and sets Vy=-0x0580. If no contact is found while grounded, Bart is made airborne. g_BartBaseYClamp is a separate vertical/base limit, not an infinite generic terrain collider. Chat: special/negative terrain tops start velocityY=-0580 and a 09h gravity-free hold; parking-meter scenery uses this generic terrain mechanism. | HIGH | MAP10+CHAT |

### text

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:75F4` | `0x75F4` | `UpdateInGameTextMessage` | Multi-state in-game message renderer. Opens the overlay, streams text/control bytes with a character delay, maintains cursor/column/screen offset and lifetime, then closes the overlay and releases movement lock. | HIGH | MAP10 |

### world

| DOS address | Flat EXE offset | Function name | Description | Confidence | Source |
| --- | --- | --- | --- | --- | --- |
| `0000:2C1D` | `0x2C1D` | `UpdateTerrainAndObjectWindowPointers` | Maintains the camera-relative windows into sorted StaticTerrain (6-byte stride) and LevelObjectSource (10-byte stride). Direction comes from Bart velocity unless g_StreamingDirectionOverridePending supplies a forced delta. Positive motion advances left/right pointers; negative motion walks them backward. Terrain window covers camera..camera+0x140 and object sources roughly camera-0x30..camera+0x170. Clears the one-shot direction override before returning. | MEDIUM | MAP10 |
| `0000:2CB0` | `0x2CB0` | `AdvanceTerrainAndObjectWindowPointers` | Forward/rightward half of UpdateTerrainAndObjectWindowPointers. Advances terrain and object-source cursors through their X-sorted records until they cover the current camera window. Used during initialization/reposition and paths that already know the effective direction is nonnegative. | HIGH | MAP10 |

## Internal code labels and state-machine blocks

These recovered jump targets are useful when following assembly, but are not asserted to be independent callable functions. Entries already present in the function table are omitted here.

| Root DOS address | Label | Description | Confidence | Source |
| --- | --- | --- | --- | --- |
| `0000:3044` | `HudStatus_Level1` | Level-1 HUD dispatch block; updates the spray-can meter from 0815. | HIGH | CSV11+CHAT |
| `0000:3093` | `HudStatus_Level5` | Level-5 HUD dispatch block for the level-specific counter/cells. | HIGH | CSV11+CHAT |
| `0000:31EF` | `HudStatus_Level2_NoExtraStatus` | Level-2 HUD dispatch target; no additional level-specific status update. | HIGH | CSV11+CHAT |
| `0000:31F0` | `HudStatus_Level3` | Level-3 HUD dispatch block; updates the slingshot meter from 0782. | HIGH | CSV11+CHAT |
| `0000:321F` | `HudStatus_Level4` | Level-4 HUD dispatch block; updates the dart meter from 0781. | HIGH | CSV11+CHAT |
| `0000:3C54` | `Level3Special_State06_CreatePrimaryObject` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:3C6D` | `Level3Special_State08` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:3D19` | `Level3Special_State12` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:3D58` | `Level3Special_State14` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:3DDB` | `Level3Special_State0E` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:3E01` | `Level3Special_State10` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:3F89` | `Level3Special_State04` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4044` | `Level3Special_State0A` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4081` | `Level3Special_State0C` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4809` | `Level5Special_State04` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4860` | `Level5Special_State06` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:495F` | `Level5Special_State08` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4976` | `Level5Special_State0A` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4988` | `Level5Special_State0C` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4998` | `Level5Special_State0E` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:49AD` | `Level5Special_State10` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:49CC` | `Level5Special_State18` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4A4C` | `Level5Special_State20` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4A6C` | `Level5Special_State24` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4B0A` | `Level5Special_State26` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4B21` | `Level5Special_State28` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4B33` | `Level5Special_State2A` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4B69` | `Level5Secondary_SharedState02_04` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4B6F` | `Level5Secondary_State06` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4BEF` | `Level5Secondary_State08` | Recovered computed-jump block of the indicated level/state sequence. The state and address are identified; a more specific behavioral summary is not supplied by this source. | HIGH | CSV11 |
| `0000:4C2A` | `Level1Special_State02_CreatePrimaryObject` | Shop state 02 creates the primary transient graphic object and advances the sequence. | HIGH | CSV11+CHAT |
| `0000:4C4E` | `Level1Special_State06_CreateEffects` | Shop state 06 creates three menu/effect transients; together with the primary object these use four runtime slots. | HIGH | CSV11+CHAT |
| `0000:4CA7` | `Level1Special_State0A_ClearEffects` | Shop state 0A removes the three menu/effect objects before closing the interaction. | HIGH | CSV11+CHAT |
| `0000:4CC5` | `Level1Special_State0C_ActivatePrimary` | Shop state 0C activates/repoints the primary graphic object for the closing phase. | HIGH | CSV11+CHAT |
| `0000:4CE3` | `Level1Special_SharedTimerState04_0E` | Shared shop states 04/0E wait on the sequence timer before advancing. | HIGH | CSV11+CHAT |
| `0000:4CEF` | `Level1Special_State08_HandleSelection` | Shop state 08: A exits, O/P select, Space buys. Purchase BCD-decrements coins, decrements binary shop stock and BCD-increments the selected inventory counter. | HIGH | CSV11+CHAT |
| `0000:4DB7` | `Level1Special_State10_Reset` | Shop state 10 clears special-sequence state and restores ordinary gameplay. | HIGH | CSV11+CHAT |
| `0000:68E8` | `Collision_BartActionHitObject_Continue` | Internal continuation of Collision_BartActionHitObject at 68DE; shares its POP BP/RET. Older ResolveBartActionHitboxCollision function boundary was removed by V10. | HIGH | FIX10 |
| `0000:6FC4` | `BartAction_State2_ActivateTransient` | Bart action state 2 activates the reserved transient action object used by CHERRY BOMB. | HIGH | CSV11+CHAT |
| `0000:7000` | `BartAction_Latched02_EndIfObjectGone` | Latched action branch 02 ends the action when its reserved runtime object is gone. | HIGH | CSV11+CHAT |
| `0000:700D` | `BartAction_Latched00_Update` | Latched action branch 00 updates the current reserved action object; detailed phase semantics need further recovery. | HIGH | CSV11+CHAT |
| `0000:7049` | `BartAction_Latched06_SetState6` | Latched branch 06 changes the action state to 6; detailed phase semantics remain incompletely named. | HIGH | CSV11+CHAT |
| `0000:7058` | `BartAction_State4_ActivateTransient` | Bart action state 4 initializes a stationary reserved ROCKET graphic object at Bart X +/-10h, Y+10h with motion cleared. | HIGH | CSV11+CHAT |
| `0000:709B` | `BartAction_Latched04_UpdateHitbox` | Latched action branch 04 updates the separate action hitbox; it does not use Bart body geometry. | HIGH | CSV11+CHAT |
| `0000:7412` | `InventoryUse_Item13_TailResumeGameplay` | Inventory item 13 (PAUSE) tail-resumes gameplay through the shared resume path. | HIGH | CSV11+CHAT |
| `0000:7416` | `InventoryUse_Item07_Level3Trigger` | Inventory item 7 (MAGNET) dispatches a Level-3 interaction trigger. | HIGH | CSV11+CHAT |
| `0000:7436` | `InventoryUse_Item09_DecrementAndSpawn` | Inventory item 9 (DONUTS) decrements its inventory counter and spawns the corresponding transient item effect. | HIGH | CSV11+CHAT |
| `0000:7467` | `InventoryUse_ResetSelection` | Shared exit/reset branch clears inventory selection state after item use. | HIGH | CSV11+CHAT |
| `0000:7473` | `InventoryUse_Item01_ToggleAlternateGraphics` | Inventory item 1 (X-RAY SPECS) toggles alternate-graphics byte 07DE between 00 and FA; flag-0400 objects render with +48h descriptor offset. | HIGH | CSV11+CHAT |
| `0000:7497` | `InventoryUse_Item04_StartActionState2` | Inventory item 4 (CHERRY BOMB) starts reserved action state 2. | HIGH | CSV11+CHAT |
| `0000:74BA` | `InventoryUse_Item05_StartActionState4` | Inventory item 5 (ROCKET) starts reserved action state 4. | HIGH | CSV11+CHAT |
| `0000:74E0` | `InventoryUse_Item12_LocationTeleport` | Inventory item 12 (KEY) checks location and requests Bart teleport/reposition with viewport/streaming rebuild. | HIGH | CSV11+CHAT |
| `0000:7513` | `InventoryUse_Item06_LocationSourceTrigger` | Inventory item 6 (WRENCH) checks Bart location and activates the configured source with 803Fh. Its external low-byte countdown is consumed by collision handler 20. | HIGH | CSV11+CHAT |
| `0000:7543` | `InventoryUse_Item02_LocationSourceTrigger` | Inventory item 2 (COIN) checks Bart location and the configured progress source; in Level 1 it activates the dormant phone controller that runs the Moe script chain. | HIGH | CSV11+CHAT |
| `0000:75A3` | `InventoryUse_Item08_LocationSourceTrigger` | Inventory item 8 (WHISTLE) checks Bart X and source state, activates its configured source and queues sound 0Fh; the Level-1 Grandpa VM sequence then spawns coins. | HIGH | CSV11+CHAT |

## Collision jump-table index

The 43-entry table is at root `0000:5F67`. Index 0 means no collision and is not a call to the code function at root 0000. Indices 1–42 reference the executable handlers catalogued above.

| Index | DOS address | Function | Mechanical behavior (reference CSV) |
| --- | --- | --- | --- |
| 0 | — | `NoCollision` | Geen collision-handler. |
| 1 | `0000:6650` | `Collision_DamageBartOrTransitionObject` | Generieke AABB. Kan object transiteren/despawnen via collision-param; anders Bart damage + invulnerability. |
| 2 | `0000:6618` | `Collision_CollectExtraLife` | AABB, effect/event, ++DS:076F, object en source-record verwijderen. |
| 3 | `0000:66F1` | `Collision_TopContactBounceBreakOrDamage` | Custom top-contact test terwijl Bart daalt. Kan Bart X/Y-velocity omkeren, object hit-count verminderen/transiteren, of Bart beschadigen. |
| 4 | `0000:6BFD` | `Collision_CollectInventoryResource` | AABB; collision-param is pointer naar inventaris/resource-byte (o.a. 0774/0775). Increment, UI selectie/timer, object verwijderen. |
| 5 | `0000:6CEC` | `Collision_ConsumeObjectAndTriggerEvent7` | AABB; effects, native/event 7, globale counter/state bijwerken, object/source verwijderen. |
| 6 | `0000:6817` | `Collision_CollectObjectiveAndAdvanceSequence` | AABB; object verwijderen, effects + native/event 8, progress/sequence globals bijwerken. |
| 7 | `0000:65DC` | `Collision_TransitionObjectAndLaunch` | AABB -> collision transition; daarna velocityX/Y instellen uit kleine tabel op basis van lage object-flagbits. |
| 8 | `0000:65B5` | `Collision_AirborneOnlyTransition` | Alleen als Bart airborne is: AABB en ApplyObjectCollisionTransition. |
| 9 | `0000:66CE` | `Collision_GroundedOnlyTransition` | Alleen als Bart niet airborne is: AABB en transition. |
| 10 | `0000:6895` | `Collision_ResolveHorizontalSolidCollision` | AABB; duwt Bart horizontaal naar buiten, reset X velocity en walk animation wanneer hij richting object beweegt. |
| 11 | `0000:6D38` | `Collision_OneWayLandingAndOptionalTransition` | Landingtest van boven; zet Bart op oppervlak, Vy=0/airborne=0. Object-count kan dalen en daarna transitie uitvoeren. |
| 12 | `0000:6DC6` | `Collision_LandOnMovingPlatform` | One-way landing op object; Vy=0, airborne=0 en Bart X wordt meegenomen met object-delta. |
| 13 | `0000:66DC` | `Collision_DescendingAirborneTransition` | Alleen airborne én niet meer stijgend: AABB en transition. |
| 14 | `0000:667A` | `Collision_SecondaryHitboxBossDamage3` | Test een secundaire hitbox/object i.p.v. Bart; bij hit DS:0896 -= 3, current object verwijderd, statusflag kan gezet worden. |
| 15 | `0000:68DE` | `Collision_BartActionHitObject` | Gebruikt dedicated action-object op 0EB7 en facing-afhankelijke hitbox. Verlaagt object hit-count of transition/despawn. |
| 16 | `0000:697D` | `Collision_SpecialObjectType2RegionTransition` | Reageert op reserved action-object 0E87 wanneer typeOffset==2 en het binnen hardcoded regio ligt; voert transition uit. |
| 17 | `0000:6A07` | `Collision_SpecialObjectType4HitTransition` | Test reserved action-object 0E87 met typeOffset==4 tegen object; bij overlap transition. |
| 18 | `0000:69AD` | `Collision_BartProjectileHitsBoss` | Test reserved action-object typeOffset==6; bij overlap --DS:0896, action-object uitschakelen en globale status bijwerken. |
| 19 | `0000:65C4` | `Collision_CollectInvulnerabilityPickup` | AABB; effect, zet Bart damage-immunity timer DS:083D op 0xFA en despawnt pickup. |
| 20 | `0000:6E50` | `Collision_ExternalCountdownTransition` | Kijkt naar extern/source record; decrement byte zolang 0x8000-status actief is, transition wanneer teller nul wordt. |
| 21 | `0000:6B87` | `Collision_LinkedObjectSpecialTransition` | Hardcoded positie/typevoorwaarden; zoekt gekoppeld runtime-object en forceert een specifieke objecttransitie. |
| 22 | `0000:6E70` | `Collision_FeetOnlyDamageOrTransition` | Verplaatst Bart-top 20 px omlaag vóór AABB: alleen onderste/voetzone. Daarna dezelfde damage/transition-logica als 6650. |
| 23 | `0000:6B47` | `Collision_LinkedObjectProximityTransition` | Zoekt ander runtime-object met opgegeven typeOffset en test nabijheid; current object verwijderen en linked object transiteren. |
| 24 | `0000:6480` | `Collision_SpecialObjectType8HitElseHazard` | Reserved action-object typeOffset==8 kan object triggeren; anders valt routine terug op event/destroy-handler 6CEC. |
| 25 | `0000:6A6D` | `Collision_SpecialObjectType10ClearIndexedFlag` | Reserved action-object typeOffset==0x0A/state 2; overlap wist indexed global flag. |
| 26 | `0000:6AC7` | `Collision_SpecialObjectType12ClearFlagAndCount` | Reserved action-object typeOffset==0x0C/state 2; overlap wist object flag en kan globale teller 0813 verhogen. |
| 27 | `0000:5FBD` | `Collision_SpecialObjectType14HitElseEvent` | Reserved action-object typeOffset==0x0E kan transition triggeren; anders afhankelijk van objectflag fallback naar 6CEC. |
| 28 | `0000:6054` | `Collision_FallingLargeObjectHazardOrTopContact` | Speciale ruime contacttest voor object met positieve Vy; directe Bart damage of fallback naar top-contact handler 66F1. |
| 29 | `0000:6086` | `Collision_DamageBartIfObjectField2CZero` | Alleen wanneer object +2C byte nul is: generieke damage/transition-handler 6650. |
| 30 | `0000:617B` | `Collision_IncrementSpecialCounter780IfReady` | AABB; onder globale voorwaarden ++byte 0780 en zet busy/statusflag 0784. |
| 31 | `0000:60D6` | `Collision_AirbornePatternMatchTransition` | Airborne AABB; vergelijkt lage objectflags met cyclische patroonstate 0768 en transition bij match. |
| 32 | `0000:60AB` | `Collision_CollectSequenceTokenAndAdvance` | AABB; sound, DS:076A += 4, object/source verwijderen tot target 0x1C. |
| 33 | `0000:6090` | `Collision_PlatformLandingAndToggle76C` | Roept moving-platform landing aan; wanneer DS:076A==0x1C togglet DS:076C. |
| 34 | `0000:61DB` | `Collision_BounceBartUpward` | AABB; forceert airborne/jump-state en maakt Bart Vy telkens meer negatief tot ongeveer -5.0. |
| 35 | `0000:62DD` | `Collision_SpecialObjectType16DestroyAndAdvance` | Reserved action-object typeOffset==0x10, stilstaand; overlap vernietigt current object en transformeert state 0817. |
| 36 | `0000:6338` | `Collision_MovingPlatformLandingWithDisplacement` | Landingvariant; corrigeert Bart Y, Vy, airborne en schuift Bart X mee op basis van object previous/current X. |
| 37 | `0000:63C6` | `Collision_MovingHazardDamageOrLandingTransition` | Bij bewegend object kan directe damage volgen; bij stil object + dalende Bart gebruikt contact om transition uit te voeren. |
| 38 | `0000:6258` | `Collision_SpecialObjectType8HitElseDamage` | Reserved action-object typeOffset==8 kan current object transiteren; anders normale AABB en Bart damage. |
| 39 | `0000:612E` | `Collision_SecondaryHitboxStopTargetVelocityX` | Test secondary object/hitbox via pointer 079D en bbox 089A; bij hit zet target +12 velocityX op nul. |
| 40 | `0000:619F` | `Collision_ConsumeCounter780AndMarkProgress` | AABB; consumeert byte 0780, update 0766 en markeert opeenvolgende level records met 0x8000. |
| 41 | `0000:61F8` | `Collision_SecondaryHitboxDamageAndLaunchObject` | Secondary hitbox; vermindert target byte, maakt current object non-collidable en geeft launch velocity/acceleration. |
| 42 | `0000:6440` | `Collision_RisingObjectActivateLinkedRecords` | Wanneer current object stijgt en hoog genoeg is: one-shot flag 0823 en zet 0x8000-status op twee via profiel gekoppelde records. |

## Display overlays: VGA, EGA, CGA and TGA

V11 identifies these platform API targets by the 64-entry FAR-pointer table at overlay offset 0000. A target may serve several slots; aliases are kept in one row at that address. These API names are recovered interface labels: neutral names such as `RenderPassA` do not imply that the complete blitter has been decoded. Explicit audio/timer functions have stronger descriptions from V11.

### VGA

| Overlay address | Function / API aliases | Description | Source |
| --- | --- | --- | --- |
| `VGA:059C` | `VGA_Api_LoadLevelData` | Platform API +D0 (LoadLevelData). | OV11 |
| `VGA:05A4` | `VGA_Api_LoadCommonPresentationOverlay` | Platform API +DC (LoadCommonPresentationOverlay). | OV11 |
| `VGA:060D` | `VGA_Api_UnloadCommonPresentationOverlay` | Platform API +E0 (UnloadCommonPresentationOverlay). | OV11 |
| `VGA:0654` | `VGA_Api_InitLevelGraphicsState`<br>`VGA_Api_InitLevelRuntimeState` | Platform API +D4 (InitLevelGraphicsState). Platform API +D8 (InitLevelRuntimeState). | OV11 |
| `VGA:0655` | `VGA_Api_UpdateDeathHud` | Platform API +CC (UpdateDeathHud). | OV11 |
| `VGA:065C` | `VGA_Api_UnloadPresentationResource` | Platform API +C4 (UnloadPresentationResource). | OV11 |
| `VGA:0663` | `VGA_Api_DrawTextCharAtPosition` | Platform API +C0 (DrawTextCharAtPosition). | OV11 |
| `VGA:0710` | `VGA_EnableAudioCommands`<br>`VGA_Api_EnableAudioCommands` | Clears the display audio-block byte (API +B4). Platform API +B4 (EnableAudioCommands). | OV11 |
| `VGA:0717` | `VGA_DisableAudioCommands`<br>`VGA_Api_DisableAudioCommands` | Sets the display audio-block byte (API +B8). Platform API +B8 (DisableAudioCommands). | OV11 |
| `VGA:0732` | `VGA_Api_ScriptSpecial3Bytes` | Platform API +A4 (ScriptSpecial3Bytes). | OV11 |
| `VGA:077F` | `VGA_Api_Level5HudReset0` | Platform API +94 (Level5HudReset0). | OV11 |
| `VGA:0786` | `VGA_Api_Level5HudReset1` | Platform API +98 (Level5HudReset1). | OV11 |
| `VGA:078D` | `VGA_Api_Level5HudReset2` | Platform API +9C (Level5HudReset2). | OV11 |
| `VGA:0794` | `VGA_Api_Level5HudReset3` | Platform API +A0 (Level5HudReset3). | OV11 |
| `VGA:079B` | `VGA_Api_GameplayService5D` | Platform API +78 (GameplayService5D). | OV11 |
| `VGA:07AB` | `VGA_Api_GameplayService61` | Platform API +7C (GameplayService61). | OV11 |
| `VGA:07BE` | `VGA_Api_PresentationResourceA1` | Platform API +BC (PresentationResourceA1). | OV11 |
| `VGA:0852` | `VGA_Api_LoadLevelResourcePartA` | Platform API +C8 (LoadLevelResourcePartA). | OV11 |
| `VGA:08CA` | `VGA_Api_PresentationReset` | Platform API +74 (PresentationReset). | OV11 |
| `VGA:0D9D` | `VGA_Api_LevelResourceStep` | Platform API +5C (LevelResourceStep). | OV11 |
| `VGA:0E6B` | `VGA_Api_TransitionBegin` | Platform API +50 (TransitionBegin). | OV11 |
| `VGA:0E93` | `VGA_Api_RebuildViewport` | Platform API +54 (RebuildViewport). | OV11 |
| `VGA:0EEE` | `VGA_Api_TransitionPoll` | Platform API +58 (TransitionPoll). | OV11 |
| `VGA:0FA4` | `VGA_Api_EndHudOverlay` | Platform API +4C (EndHudOverlay). | OV11 |
| `VGA:0FAB` | `VGA_Api_BeginHudOverlay` | Platform API +48 (BeginHudOverlay). | OV11 |
| `VGA:0FD1` | `VGA_Api_DrawHudSelector` | Platform API +6C (DrawHudSelector). | OV11 |
| `VGA:102F` | `VGA_Api_DrawHudBlock` | Platform API +30 (DrawHudBlock). | OV11 |
| `VGA:1089` | `VGA_Api_DrawHudNumber` | Platform API +68 (DrawHudNumber). | OV11 |
| `VGA:10EA` | `VGA_Api_DrawHudValue` | Platform API +2C (DrawHudValue). | OV11 |
| `VGA:1147` | `VGA_Api_DrawTextCharacter` | Platform API +70 (DrawTextCharacter). | OV11 |
| `VGA:1183` | `VGA_Api_DrawHudSpriteB` | Platform API +64 (DrawHudSpriteB). | OV11 |
| `VGA:11B4` | `VGA_Api_DrawHudSprite` | Platform API +28 (DrawHudSprite). | OV11 |
| `VGA:129F` | `VGA_Api_DrawHudSpriteA` | Platform API +60 (DrawHudSpriteA). | OV11 |
| `VGA:13ED` | `VGA_Api_Level5HudCell0` | Platform API +84 (Level5HudCell0). | OV11 |
| `VGA:144A` | `VGA_Api_Level5HudCell1` | Platform API +88 (Level5HudCell1). | OV11 |
| `VGA:14A7` | `VGA_Api_Level5HudCell2` | Platform API +8C (Level5HudCell2). | OV11 |
| `VGA:1504` | `VGA_Api_Level5HudCell3` | Platform API +90 (Level5HudCell3). | OV11 |
| `VGA:1561` | `VGA_Api_DrawAnimatedHudIcon` | Platform API +24 (DrawAnimatedHudIcon). | OV11 |
| `VGA:15BE` | `VGA_Api_DrawInventoryIcon` | Platform API +3C (DrawInventoryIcon). | OV11 |
| `VGA:161B` | `VGA_Api_InitHudFramePartA` | Platform API +40 (InitHudFramePartA). | OV11 |
| `VGA:1678` | `VGA_Api_InitHudFramePartB` | Platform API +44 (InitHudFramePartB). | OV11 |
| `VGA:16D5` | `VGA_Api_InitLevelResource` | Platform API +20 (InitLevelResource). | OV11 |
| `VGA:1805` | `VGA_Api_RenderPassB` | Platform API +1C (RenderPassB). | OV11 |
| `VGA:18EF` | `VGA_Api_RenderPassA` | Platform API +18 (RenderPassA). | OV11 |
| `VGA:34D1` | `VGA_Api_CameraRenderService65` | Platform API +80 (CameraRenderService65). | OV11 |
| `VGA:370C` | `VGA_Api_UpdateCamera` | Platform API +10 (UpdateCamera). | OV11 |
| `VGA:388E` | `VGA_IRQ0_TimerHandler` | Replacement INT 08h/IRQ0 handler; advances timing, periodically calls sound-driver :0000 and chains to saved BIOS timer. | OV11 |
| `VGA:39E3` | `VGA_Api_FrameServiceA` | Platform API +14 (FrameServiceA). | OV11 |
| `VGA:3A1A` | `VGA_Api_BartMovementStep` | Platform API +0C (BartMovementStep). | OV11 |
| `VGA:3B02` | `VGA_Api_FrameTick` | Platform API +34 (FrameTick). | OV11 |
| `VGA:3C5E` | `VGA_Api_SetupLevelGraphics` | Platform API +08 (SetupLevelGraphics). | OV11 |
| `VGA:3CDA` | `VGA_Api_PresentationStepA` | Platform API +04 (PresentationStepA). | OV11 |
| `VGA:3E7F` | `VGA_Api_ExitCleanup` | Platform API +00 (ExitCleanup). | OV11 |
| `VGA:3F5A` | `VGA_QueueMusicCommand`<br>`VGA_Api_QueueMusicCommand` | If audio enabled, clears AH and writes AX to sound backend mailbox +0008 (API +AC). Platform API +AC (QueueMusicCommand). | OV11 |
| `VGA:3F70` | `VGA_QueueSoundEffect`<br>`VGA_Api_QueueSoundEffect` | If audio enabled, writes AL to sound backend mailbox +000A (API +B0). Platform API +B0 (QueueSoundEffect). | OV11 |
| `VGA:3F86` | `VGA_ProbeLoadedSoundDriver` | AL=0; FAR calls raw-loaded sound driver :0004 and stores returned AL as probe result. | OV11 |

Internal label `VGA:3D89` — `VGA_SoundDriverSearchLoop`: tries `roland.ovl`, `adlib.ovl`, `buzzer.ovl` using DOS OPEN/READ/CLOSE, then probes driver entry +0004. This is labelled as a code block in V11, not counted as a separate function.

### EGA

| Overlay address | Function / API aliases | Description | Source |
| --- | --- | --- | --- |
| `EGA:02A5` | `EGA_Api_InitLevelGraphicsState`<br>`EGA_Api_InitLevelRuntimeState`<br>`EGA_Api_LoadCommonPresentationOverlay`<br>`EGA_Api_UnloadCommonPresentationOverlay` | Platform API +D4 (InitLevelGraphicsState). Platform API +D8 (InitLevelRuntimeState). Platform API +DC (LoadCommonPresentationOverlay). Platform API +E0 (UnloadCommonPresentationOverlay). | OV11 |
| `EGA:02A6` | `EGA_Api_LoadLevelData` | Platform API +D0 (LoadLevelData). | OV11 |
| `EGA:02AC` | `EGA_Api_UpdateDeathHud` | Platform API +CC (UpdateDeathHud). | OV11 |
| `EGA:02B3` | `EGA_Api_UnloadPresentationResource` | Platform API +C4 (UnloadPresentationResource). | OV11 |
| `EGA:02BA` | `EGA_Api_DrawTextCharAtPosition` | Platform API +C0 (DrawTextCharAtPosition). | OV11 |
| `EGA:0327` | `EGA_EnableAudioCommands`<br>`EGA_Api_EnableAudioCommands` | Clears the display audio-block byte (API +B4). Platform API +B4 (EnableAudioCommands). | OV11 |
| `EGA:032E` | `EGA_DisableAudioCommands`<br>`EGA_Api_DisableAudioCommands` | Sets the display audio-block byte (API +B8). Platform API +B8 (DisableAudioCommands). | OV11 |
| `EGA:0340` | `EGA_Api_ScriptSpecial3Bytes` | Platform API +A4 (ScriptSpecial3Bytes). | OV11 |
| `EGA:034D` | `EGA_Api_Level5HudReset0` | Platform API +94 (Level5HudReset0). | OV11 |
| `EGA:0354` | `EGA_Api_Level5HudReset1` | Platform API +98 (Level5HudReset1). | OV11 |
| `EGA:035B` | `EGA_Api_Level5HudReset2` | Platform API +9C (Level5HudReset2). | OV11 |
| `EGA:0362` | `EGA_Api_Level5HudReset3` | Platform API +A0 (Level5HudReset3). | OV11 |
| `EGA:0369` | `EGA_Api_GameplayService5D` | Platform API +78 (GameplayService5D). | OV11 |
| `EGA:0379` | `EGA_Api_GameplayService61` | Platform API +7C (GameplayService61). | OV11 |
| `EGA:038C` | `EGA_Api_PresentationResourceA1` | Platform API +BC (PresentationResourceA1). | OV11 |
| `EGA:0471` | `EGA_Api_LoadLevelResourcePartA` | Platform API +C8 (LoadLevelResourcePartA). | OV11 |
| `EGA:04E1` | `EGA_Api_PresentationReset` | Platform API +74 (PresentationReset). | OV11 |
| `EGA:0602` | `EGA_Api_LevelResourceStep` | Platform API +5C (LevelResourceStep). | OV11 |
| `EGA:06D0` | `EGA_Api_TransitionBegin` | Platform API +50 (TransitionBegin). | OV11 |
| `EGA:06DB` | `EGA_Api_RebuildViewport` | Platform API +54 (RebuildViewport). | OV11 |
| `EGA:0724` | `EGA_Api_TransitionPoll` | Platform API +58 (TransitionPoll). | OV11 |
| `EGA:0760` | `EGA_Api_EndHudOverlay` | Platform API +4C (EndHudOverlay). | OV11 |
| `EGA:0767` | `EGA_Api_BeginHudOverlay` | Platform API +48 (BeginHudOverlay). | OV11 |
| `EGA:078D` | `EGA_Api_DrawHudSelector` | Platform API +6C (DrawHudSelector). | OV11 |
| `EGA:07EB` | `EGA_Api_DrawHudBlock` | Platform API +30 (DrawHudBlock). | OV11 |
| `EGA:0845` | `EGA_Api_DrawHudNumber` | Platform API +68 (DrawHudNumber). | OV11 |
| `EGA:08A6` | `EGA_Api_DrawHudValue` | Platform API +2C (DrawHudValue). | OV11 |
| `EGA:0903` | `EGA_Api_DrawTextCharacter` | Platform API +70 (DrawTextCharacter). | OV11 |
| `EGA:093F` | `EGA_Api_DrawHudSpriteB` | Platform API +64 (DrawHudSpriteB). | OV11 |
| `EGA:0970` | `EGA_Api_DrawHudSprite` | Platform API +28 (DrawHudSprite). | OV11 |
| `EGA:0A5B` | `EGA_Api_DrawHudSpriteA` | Platform API +60 (DrawHudSpriteA). | OV11 |
| `EGA:0BA9` | `EGA_Api_Level5HudCell0` | Platform API +84 (Level5HudCell0). | OV11 |
| `EGA:0C06` | `EGA_Api_Level5HudCell1` | Platform API +88 (Level5HudCell1). | OV11 |
| `EGA:0C63` | `EGA_Api_Level5HudCell2` | Platform API +8C (Level5HudCell2). | OV11 |
| `EGA:0CC0` | `EGA_Api_Level5HudCell3` | Platform API +90 (Level5HudCell3). | OV11 |
| `EGA:0D1D` | `EGA_Api_DrawAnimatedHudIcon` | Platform API +24 (DrawAnimatedHudIcon). | OV11 |
| `EGA:0D7A` | `EGA_Api_DrawInventoryIcon` | Platform API +3C (DrawInventoryIcon). | OV11 |
| `EGA:0DD7` | `EGA_Api_InitHudFramePartA` | Platform API +40 (InitHudFramePartA). | OV11 |
| `EGA:0E34` | `EGA_Api_InitHudFramePartB` | Platform API +44 (InitHudFramePartB). | OV11 |
| `EGA:0E91` | `EGA_Api_InitLevelResource` | Platform API +20 (InitLevelResource). | OV11 |
| `EGA:0FC1` | `EGA_Api_RenderPassB` | Platform API +1C (RenderPassB). | OV11 |
| `EGA:102D` | `EGA_Api_RenderPassA` | Platform API +18 (RenderPassA). | OV11 |
| `EGA:29AC` | `EGA_Api_CameraRenderService65` | Platform API +80 (CameraRenderService65). | OV11 |
| `EGA:2BE7` | `EGA_Api_UpdateCamera` | Platform API +10 (UpdateCamera). | OV11 |
| `EGA:2D69` | `EGA_IRQ0_TimerHandler` | Replacement INT 08h/IRQ0 handler; advances timing, periodically calls sound-driver :0000 and chains to saved BIOS timer. | OV11 |
| `EGA:2E8F` | `EGA_Api_FrameServiceA` | Platform API +14 (FrameServiceA). | OV11 |
| `EGA:2EC6` | `EGA_Api_BartMovementStep` | Platform API +0C (BartMovementStep). | OV11 |
| `EGA:2FAE` | `EGA_Api_FrameTick` | Platform API +34 (FrameTick). | OV11 |
| `EGA:310A` | `EGA_Api_SetupLevelGraphics` | Platform API +08 (SetupLevelGraphics). | OV11 |
| `EGA:3142` | `EGA_Api_PresentationStepA` | Platform API +04 (PresentationStepA). | OV11 |
| `EGA:32EA` | `EGA_Api_ExitCleanup` | Platform API +00 (ExitCleanup). | OV11 |
| `EGA:33C7` | `EGA_QueueMusicCommand`<br>`EGA_Api_QueueMusicCommand` | If audio enabled, clears AH and writes AX to sound backend mailbox +0008 (API +AC). Platform API +AC (QueueMusicCommand). | OV11 |
| `EGA:33DD` | `EGA_QueueSoundEffect`<br>`EGA_Api_QueueSoundEffect` | If audio enabled, writes AL to sound backend mailbox +000A (API +B0). Platform API +B0 (QueueSoundEffect). | OV11 |
| `EGA:33F3` | `EGA_ProbeLoadedSoundDriver` | AL=0; FAR calls raw-loaded sound driver :0004 and stores returned AL as probe result. | OV11 |

Internal label `EGA:31F1` — `EGA_SoundDriverSearchLoop`: tries `roland.ovl`, `adlib.ovl`, `buzzer.ovl` using DOS OPEN/READ/CLOSE, then probes driver entry +0004. This is labelled as a code block in V11, not counted as a separate function.

### CGA

| Overlay address | Function / API aliases | Description | Source |
| --- | --- | --- | --- |
| `CGA:027E` | `CGA_Api_LoadCommonPresentationOverlay`<br>`CGA_Api_UnloadCommonPresentationOverlay` | Platform API +DC (LoadCommonPresentationOverlay). Platform API +E0 (UnloadCommonPresentationOverlay). | OV11 |
| `CGA:027F` | `CGA_Api_InitLevelRuntimeState` | Platform API +D8 (InitLevelRuntimeState). | OV11 |
| `CGA:030F` | `CGA_Api_LoadLevelData` | Platform API +D0 (LoadLevelData). | OV11 |
| `CGA:0315` | `CGA_Api_UpdateDeathHud` | Platform API +CC (UpdateDeathHud). | OV11 |
| `CGA:031C` | `CGA_Api_UnloadPresentationResource` | Platform API +C4 (UnloadPresentationResource). | OV11 |
| `CGA:0323` | `CGA_Api_DrawTextCharAtPosition` | Platform API +C0 (DrawTextCharAtPosition). | OV11 |
| `CGA:0359` | `CGA_EnableAudioCommands`<br>`CGA_Api_EnableAudioCommands` | Clears the display audio-block byte (API +B4). Platform API +B4 (EnableAudioCommands). | OV11 |
| `CGA:0360` | `CGA_DisableAudioCommands`<br>`CGA_Api_DisableAudioCommands` | Sets the display audio-block byte (API +B8). Platform API +B8 (DisableAudioCommands). | OV11 |
| `CGA:036F` | `CGA_Api_ScriptSpecial3Bytes` | Platform API +A4 (ScriptSpecial3Bytes). | OV11 |
| `CGA:037D` | `CGA_Api_Level5HudReset0` | Platform API +94 (Level5HudReset0). | OV11 |
| `CGA:0384` | `CGA_Api_Level5HudReset1` | Platform API +98 (Level5HudReset1). | OV11 |
| `CGA:038B` | `CGA_Api_Level5HudReset2` | Platform API +9C (Level5HudReset2). | OV11 |
| `CGA:0392` | `CGA_Api_Level5HudReset3` | Platform API +A0 (Level5HudReset3). | OV11 |
| `CGA:0399` | `CGA_Api_GameplayService5D` | Platform API +78 (GameplayService5D). | OV11 |
| `CGA:03A9` | `CGA_Api_GameplayService61` | Platform API +7C (GameplayService61). | OV11 |
| `CGA:03C4` | `CGA_Api_InitLevelGraphicsState` | Platform API +D4 (InitLevelGraphicsState). | OV11 |
| `CGA:03D5` | `CGA_Api_PresentationResourceA1` | Platform API +BC (PresentationResourceA1). | OV11 |
| `CGA:0465` | `CGA_Api_LoadLevelResourcePartA` | Platform API +C8 (LoadLevelResourcePartA). | OV11 |
| `CGA:0596` | `CGA_Api_PresentationReset` | Platform API +74 (PresentationReset). | OV11 |
| `CGA:065F` | `CGA_Api_LevelResourceStep` | Platform API +5C (LevelResourceStep). | OV11 |
| `CGA:06EE` | `CGA_Api_TransitionBegin` | Platform API +50 (TransitionBegin). | OV11 |
| `CGA:06FD` | `CGA_Api_RebuildViewport` | Platform API +54 (RebuildViewport). | OV11 |
| `CGA:072E` | `CGA_Api_TransitionPoll` | Platform API +58 (TransitionPoll). | OV11 |
| `CGA:0754` | `CGA_Api_EndHudOverlay` | Platform API +4C (EndHudOverlay). | OV11 |
| `CGA:075B` | `CGA_Api_BeginHudOverlay` | Platform API +48 (BeginHudOverlay). | OV11 |
| `CGA:0779` | `CGA_Api_DrawHudSelector` | Platform API +6C (DrawHudSelector). | OV11 |
| `CGA:079C` | `CGA_Api_DrawHudBlock` | Platform API +30 (DrawHudBlock). | OV11 |
| `CGA:07BB` | `CGA_Api_DrawHudNumber` | Platform API +68 (DrawHudNumber). | OV11 |
| `CGA:081C` | `CGA_Api_DrawHudValue` | Platform API +2C (DrawHudValue). | OV11 |
| `CGA:0879` | `CGA_Api_DrawTextCharacter` | Platform API +70 (DrawTextCharacter). | OV11 |
| `CGA:08B4` | `CGA_Api_DrawHudSpriteB` | Platform API +64 (DrawHudSpriteB). | OV11 |
| `CGA:08E1` | `CGA_Api_DrawHudSprite` | Platform API +28 (DrawHudSprite). | OV11 |
| `CGA:0979` | `CGA_Api_DrawHudSpriteA` | Platform API +60 (DrawHudSpriteA). | OV11 |
| `CGA:09D9` | `CGA_Api_Level5HudCell0` | Platform API +84 (Level5HudCell0). | OV11 |
| `CGA:0A3A` | `CGA_Api_Level5HudCell1` | Platform API +88 (Level5HudCell1). | OV11 |
| `CGA:0A9B` | `CGA_Api_Level5HudCell2` | Platform API +8C (Level5HudCell2). | OV11 |
| `CGA:0AFC` | `CGA_Api_Level5HudCell3` | Platform API +90 (Level5HudCell3). | OV11 |
| `CGA:0B5D` | `CGA_Api_DrawAnimatedHudIcon` | Platform API +24 (DrawAnimatedHudIcon). | OV11 |
| `CGA:0BBE` | `CGA_Api_DrawInventoryIcon` | Platform API +3C (DrawInventoryIcon). | OV11 |
| `CGA:0C1F` | `CGA_Api_InitHudFramePartA` | Platform API +40 (InitHudFramePartA). | OV11 |
| `CGA:0C80` | `CGA_Api_InitHudFramePartB` | Platform API +44 (InitHudFramePartB). | OV11 |
| `CGA:0CE1` | `CGA_Api_InitLevelResource` | Platform API +20 (InitLevelResource). | OV11 |
| `CGA:0DB0` | `CGA_Api_RenderPassB` | Platform API +1C (RenderPassB). | OV11 |
| `CGA:0DEE` | `CGA_Api_RenderPassA` | Platform API +18 (RenderPassA). | OV11 |
| `CGA:1CEC` | `CGA_Api_CameraRenderService65` | Platform API +80 (CameraRenderService65). | OV11 |
| `CGA:1DA6` | `CGA_Api_UpdateCamera` | Platform API +10 (UpdateCamera). | OV11 |
| `CGA:1F23` | `CGA_IRQ0_TimerHandler` | Replacement INT 08h/IRQ0 handler; advances timing, periodically calls sound-driver :0000 and chains to saved BIOS timer. | OV11 |
| `CGA:1FF5` | `CGA_Api_FrameServiceA` | Platform API +14 (FrameServiceA). | OV11 |
| `CGA:206D` | `CGA_Api_BartMovementStep` | Platform API +0C (BartMovementStep). | OV11 |
| `CGA:20FC` | `CGA_Api_FrameTick` | Platform API +34 (FrameTick). | OV11 |
| `CGA:2258` | `CGA_Api_SetupLevelGraphics` | Platform API +08 (SetupLevelGraphics). | OV11 |
| `CGA:2292` | `CGA_Api_PresentationStepA` | Platform API +04 (PresentationStepA). | OV11 |
| `CGA:2441` | `CGA_Api_ExitCleanup` | Platform API +00 (ExitCleanup). | OV11 |
| `CGA:2527` | `CGA_QueueMusicCommand`<br>`CGA_Api_QueueMusicCommand` | If audio enabled, clears AH and writes AX to sound backend mailbox +0008 (API +AC). Platform API +AC (QueueMusicCommand). | OV11 |
| `CGA:253D` | `CGA_QueueSoundEffect`<br>`CGA_Api_QueueSoundEffect` | If audio enabled, writes AL to sound backend mailbox +000A (API +B0). Platform API +B0 (QueueSoundEffect). | OV11 |
| `CGA:2553` | `CGA_ProbeLoadedSoundDriver` | AL=0; FAR calls raw-loaded sound driver :0004 and stores returned AL as probe result. | OV11 |

Internal label `CGA:2334` — `CGA_SoundDriverSearchLoop`: tries `roland.ovl`, `adlib.ovl`, `buzzer.ovl` using DOS OPEN/READ/CLOSE, then probes driver entry +0004. This is labelled as a code block in V11, not counted as a separate function.

### TGA

| Overlay address | Function / API aliases | Description | Source |
| --- | --- | --- | --- |
| `TGA:0294` | `TGA_Api_LoadCommonPresentationOverlay`<br>`TGA_Api_UnloadCommonPresentationOverlay` | Platform API +DC (LoadCommonPresentationOverlay). Platform API +E0 (UnloadCommonPresentationOverlay). | OV11 |
| `TGA:0295` | `TGA_Api_InitLevelRuntimeState` | Platform API +D8 (InitLevelRuntimeState). | OV11 |
| `TGA:0318` | `TGA_Api_LoadLevelData` | Platform API +D0 (LoadLevelData). | OV11 |
| `TGA:031E` | `TGA_Api_UpdateDeathHud` | Platform API +CC (UpdateDeathHud). | OV11 |
| `TGA:0325` | `TGA_Api_UnloadPresentationResource` | Platform API +C4 (UnloadPresentationResource). | OV11 |
| `TGA:032C` | `TGA_Api_DrawTextCharAtPosition` | Platform API +C0 (DrawTextCharAtPosition). | OV11 |
| `TGA:038C` | `TGA_EnableAudioCommands`<br>`TGA_Api_EnableAudioCommands` | Clears the display audio-block byte (API +B4). Platform API +B4 (EnableAudioCommands). | OV11 |
| `TGA:0393` | `TGA_DisableAudioCommands`<br>`TGA_Api_DisableAudioCommands` | Sets the display audio-block byte (API +B8). Platform API +B8 (DisableAudioCommands). | OV11 |
| `TGA:03A5` | `TGA_Api_ScriptSpecial3Bytes` | Platform API +A4 (ScriptSpecial3Bytes). | OV11 |
| `TGA:03B2` | `TGA_Api_Level5HudReset0` | Platform API +94 (Level5HudReset0). | OV11 |
| `TGA:03B9` | `TGA_Api_Level5HudReset1` | Platform API +98 (Level5HudReset1). | OV11 |
| `TGA:03C0` | `TGA_Api_Level5HudReset2` | Platform API +9C (Level5HudReset2). | OV11 |
| `TGA:03C7` | `TGA_Api_Level5HudReset3` | Platform API +A0 (Level5HudReset3). | OV11 |
| `TGA:03CE` | `TGA_Api_GameplayService5D` | Platform API +78 (GameplayService5D). | OV11 |
| `TGA:03DE` | `TGA_Api_GameplayService61` | Platform API +7C (GameplayService61). | OV11 |
| `TGA:03F9` | `TGA_Api_InitLevelGraphicsState` | Platform API +D4 (InitLevelGraphicsState). | OV11 |
| `TGA:03FA` | `TGA_Api_PresentationResourceA1` | Platform API +BC (PresentationResourceA1). | OV11 |
| `TGA:047E` | `TGA_Api_LoadLevelResourcePartA` | Platform API +C8 (LoadLevelResourcePartA). | OV11 |
| `TGA:053D` | `TGA_Api_PresentationReset` | Platform API +74 (PresentationReset). | OV11 |
| `TGA:05FC` | `TGA_Api_LevelResourceStep` | Platform API +5C (LevelResourceStep). | OV11 |
| `TGA:06A9` | `TGA_Api_TransitionBegin` | Platform API +50 (TransitionBegin). | OV11 |
| `TGA:06BE` | `TGA_Api_RebuildViewport` | Platform API +54 (RebuildViewport). | OV11 |
| `TGA:0707` | `TGA_Api_TransitionPoll` | Platform API +58 (TransitionPoll). | OV11 |
| `TGA:0743` | `TGA_Api_EndHudOverlay` | Platform API +4C (EndHudOverlay). | OV11 |
| `TGA:0750` | `TGA_Api_BeginHudOverlay` | Platform API +48 (BeginHudOverlay). | OV11 |
| `TGA:0774` | `TGA_Api_DrawHudSelector` | Platform API +6C (DrawHudSelector). | OV11 |
| `TGA:080E` | `TGA_Api_DrawHudBlock` | Platform API +30 (DrawHudBlock). | OV11 |
| `TGA:08A4` | `TGA_Api_DrawHudNumber` | Platform API +68 (DrawHudNumber). | OV11 |
| `TGA:096D` | `TGA_Api_DrawHudValue` | Platform API +2C (DrawHudValue). | OV11 |
| `TGA:0A32` | `TGA_Api_DrawTextCharacter` | Platform API +70 (DrawTextCharacter). | OV11 |
| `TGA:0AC9` | `TGA_Api_DrawHudSpriteB` | Platform API +64 (DrawHudSpriteB). | OV11 |
| `TGA:0B54` | `TGA_Api_DrawHudSprite` | Platform API +28 (DrawHudSprite). | OV11 |
| `TGA:0D2C` | `TGA_Api_DrawHudSpriteA` | Platform API +60 (DrawHudSpriteA). | OV11 |
| `TGA:0E15` | `TGA_Api_Level5HudCell0` | Platform API +84 (Level5HudCell0). | OV11 |
| `TGA:0E7E` | `TGA_Api_Level5HudCell1` | Platform API +88 (Level5HudCell1). | OV11 |
| `TGA:0EE7` | `TGA_Api_Level5HudCell2` | Platform API +8C (Level5HudCell2). | OV11 |
| `TGA:0F50` | `TGA_Api_Level5HudCell3` | Platform API +90 (Level5HudCell3). | OV11 |
| `TGA:0FB9` | `TGA_Api_DrawAnimatedHudIcon` | Platform API +24 (DrawAnimatedHudIcon). | OV11 |
| `TGA:1022` | `TGA_Api_DrawInventoryIcon` | Platform API +3C (DrawInventoryIcon). | OV11 |
| `TGA:108B` | `TGA_Api_InitHudFramePartA` | Platform API +40 (InitHudFramePartA). | OV11 |
| `TGA:10F4` | `TGA_Api_InitHudFramePartB` | Platform API +44 (InitHudFramePartB). | OV11 |
| `TGA:115D` | `TGA_Api_InitLevelResource` | Platform API +20 (InitLevelResource). | OV11 |
| `TGA:1226` | `TGA_Api_RenderPassB` | Platform API +1C (RenderPassB). | OV11 |
| `TGA:12A4` | `TGA_Api_RenderPassA` | Platform API +18 (RenderPassA). | OV11 |
| `TGA:22FF` | `TGA_Api_CameraRenderService65` | Platform API +80 (CameraRenderService65). | OV11 |
| `TGA:249D` | `TGA_Api_UpdateCamera` | Platform API +10 (UpdateCamera). | OV11 |
| `TGA:24A3` | `TGA_IRQ0_TimerHandler` | Replacement INT 08h/IRQ0 handler; advances timing, periodically calls sound-driver :0000 and chains to saved BIOS timer. | OV11 |
| `TGA:2591` | `TGA_Api_FrameServiceA` | Platform API +14 (FrameServiceA). | OV11 |
| `TGA:2648` | `TGA_Api_BartMovementStep` | Platform API +0C (BartMovementStep). | OV11 |
| `TGA:26CE` | `TGA_Api_FrameTick` | Platform API +34 (FrameTick). | OV11 |
| `TGA:282A` | `TGA_Api_SetupLevelGraphics` | Platform API +08 (SetupLevelGraphics). | OV11 |
| `TGA:285A` | `TGA_Api_PresentationStepA` | Platform API +04 (PresentationStepA). | OV11 |
| `TGA:29E4` | `TGA_Api_ExitCleanup` | Platform API +00 (ExitCleanup). | OV11 |
| `TGA:2ABA` | `TGA_QueueMusicCommand`<br>`TGA_Api_QueueMusicCommand` | If audio enabled, clears AH and writes AX to sound backend mailbox +0008 (API +AC). Platform API +AC (QueueMusicCommand). | OV11 |
| `TGA:2AD0` | `TGA_QueueSoundEffect`<br>`TGA_Api_QueueSoundEffect` | If audio enabled, writes AL to sound backend mailbox +000A (API +B0). Platform API +B0 (QueueSoundEffect). | OV11 |
| `TGA:2AE6` | `TGA_ProbeLoadedSoundDriver` | AL=0; FAR calls raw-loaded sound driver :0004 and stores returned AL as probe result. | OV11 |

Internal label `TGA:28B7` — `TGA_SoundDriverSearchLoop`: tries `roland.ovl`, `adlib.ovl`, `buzzer.ovl` using DOS OPEN/READ/CLOSE, then probes driver entry +0004. This is labelled as a code block in V11, not counted as a separate function.

## Sound backends: ADLIB, ROLAND and BUZZER

These original files are raw backend images, not PKLITE MZ overlays. They share public FAR entries :0000 (service) and :0004 (initialize/probe). Music and SFX mailboxes at +0008/+000A are data, not executable functions. Playback is serviced asynchronously from the display timer.

### ADLIB

| Overlay address | Function | Description | Confidence / source |
| --- | --- | --- | --- |
| `ADLIB:0000` | `ADLIB_ServiceEntry` | Public FAR service entry, periodically called by display IRQ0. | HIGH / OV11 |
| `ADLIB:0004` | `ADLIB_InitializeProbeEntry` | Public FAR initialization/probe entry; AL nonzero means accepted. | HIGH / OV11 |
| `ADLIB:003D` | `ADLIB_ServiceTickInternal` | Consumes music/SFX commands and advances voices/event sequences. | HIGH / OV11 |
| `ADLIB:037E` | `ADLIB_ProcessMusicCommand` | Consumes mailbox +0008 to initialize/stop music streams. | HIGH / OV11 |
| `ADLIB:0435` | `ADLIB_ProcessPendingSoundEffect` | Consumes mailbox +000A, maps ID through the 19-entry SFX table and starts an effect voice/sequence. | HIGH / OV11 |
| `ADLIB:047B` | `ADLIB_InitializeAndProbeHardware` | Detects OPL2 using timer/status at base port 0388h. | HIGH / OV11 |
| `ADLIB:04D5` | `AdLib_WriteOplRegister` | AL=register, AH=value; writes ports 388h/389h with I/O delays. | HIGH / OV11 |
| `ADLIB:050A` | `AdLib_ReadStatus` | Reads OPL status at port 0388h. | HIGH / OV11 |

### ROLAND

| Overlay address | Function | Description | Confidence / source |
| --- | --- | --- | --- |
| `ROLAND:0000` | `ROLAND_ServiceEntry` | Public FAR service entry, periodically called by display IRQ0. | HIGH / OV11 |
| `ROLAND:0004` | `ROLAND_InitializeProbeEntry` | Public FAR initialization/probe entry; AL nonzero means accepted. | HIGH / OV11 |
| `ROLAND:0044` | `ROLAND_ServiceTickInternal` | Consumes music/SFX commands and advances voices/event sequences. | HIGH / OV11 |
| `ROLAND:02A9` | `ROLAND_ProcessMusicCommand` | Consumes mailbox +0008 to initialize/stop music streams. | HIGH / OV11 |
| `ROLAND:0393` | `ROLAND_ProcessPendingSoundEffect` | Consumes mailbox +000A, maps ID through the 19-entry SFX table and starts an effect voice/sequence. | HIGH / OV11 |
| `ROLAND:03D9` | `ROLAND_InitializeAndProbeHardware` | Probes MPU-401/LAPC-1 at 330h/331h; expects FEh ACK. | HIGH / OV11 |
| `ROLAND:045E` | `Roland_WriteMpuCommandAndWaitAck` | Writes MPU command at 331h and waits for readiness/ACK. | HIGH / OV11 |
| `ROLAND:048F` | `Roland_WriteMpuData` | Writes a data/MIDI byte at 330h after status polling. | HIGH / OV11 |

Internal label `ROLAND:03F9` — `Roland_ResetMpu401AndReadAck`: sends reset FFh at port 331h and reads response at 330h; probe expects FEh.

### BUZZER

| Overlay address | Function | Description | Confidence / source |
| --- | --- | --- | --- |
| `BUZZER:0000` | `BUZZER_ServiceEntry` | Public FAR service entry, periodically called by display IRQ0. | HIGH / OV11 |
| `BUZZER:0004` | `BUZZER_InitializeProbeEntry` | Public FAR initialization/probe entry; AL nonzero means accepted. | HIGH / OV11 |
| `BUZZER:0041` | `BUZZER_ServiceTickInternal` | Consumes music/SFX commands and advances voices/event sequences. | HIGH / OV11 |
| `BUZZER:005C` | `BUZZER_ProcessPendingSoundEffect` | Consumes mailbox +000A, maps ID through the 19-entry SFX table and starts an effect voice/sequence. | HIGH / OV11 |
| `BUZZER:0087` | `Buzzer_SpeakerOff` | Clears speaker gate bits 0/1 at port 61h. | HIGH / OV11 |
| `BUZZER:008E` | `BUZZER_InitializeAndProbeHardware` | Initializes PIT channel 2 and PC-speaker fallback. | HIGH / OV11 |
| `BUZZER:009D` | `Buzzer_StartSoundEffect` | Maps SFX ID through table 0234h and initializes sequence. | HIGH / OV11 |
| `BUZZER:00C0` | `Buzzer_AdvanceSoundSequence` | Advances three-byte duration/pitch-index/delta records and programs PIT channel 2 at 43h/42h. | HIGH / OV11 |

## Resident graphics/resource overlay entrypoints

The LEVEL overlays contain graphics resources; gameplay scripts and native callbacks discussed above live in the embedded EXE level blocks. Resource-layout and TSR/bootstrap code below is distinct from the resource payload.

| Overlay address | Function | Description | Confidence / source |
| --- | --- | --- | --- |
| `LEVEL1:001C` | `Level1Overlay_GetResourceLayout` | Returns map/tiles/object/Bart paragraph locations in AX/BX/CX/DX. | HIGH / OV11 |
| `LEVEL1:0029` | `Level1Overlay_InstallResidentAndPublishIntF1` | Saves PSP/environment, publishes resident CS:0000 through INT F1, then DOS AH=31h terminate-stay-resident. | HIGH / OV11 |
| `LEVEL1:0057` | `Level1Overlay_FreeResidentResources` | DOS AH=49h frees saved environment and resident PSP/allocation. | HIGH / OV11 |
| `LEVEL2:001C` | `Level2Overlay_GetResourceLayout` | Returns map/tiles/object/Bart paragraph locations in AX/BX/CX/DX. | HIGH / OV11 |
| `LEVEL2:0029` | `Level2Overlay_InstallResidentAndPublishIntF1` | Saves PSP/environment, publishes resident CS:0000 through INT F1, then DOS AH=31h terminate-stay-resident. | HIGH / OV11 |
| `LEVEL2:0057` | `Level2Overlay_FreeResidentResources` | DOS AH=49h frees saved environment and resident PSP/allocation. | HIGH / OV11 |
| `LEVEL3:001C` | `Level3Overlay_GetResourceLayout` | Returns map/tiles/object/Bart paragraph locations in AX/BX/CX/DX. | HIGH / OV11 |
| `LEVEL3:0029` | `Level3Overlay_InstallResidentAndPublishIntF1` | Saves PSP/environment, publishes resident CS:0000 through INT F1, then DOS AH=31h terminate-stay-resident. | HIGH / OV11 |
| `LEVEL3:0057` | `Level3Overlay_FreeResidentResources` | DOS AH=49h frees saved environment and resident PSP/allocation. | HIGH / OV11 |
| `LEVEL4:001C` | `Level4Overlay_GetResourceLayout` | Returns map/tiles/object/Bart paragraph locations in AX/BX/CX/DX. | HIGH / OV11 |
| `LEVEL4:0029` | `Level4Overlay_InstallResidentAndPublishIntF1` | Saves PSP/environment, publishes resident CS:0000 through INT F1, then DOS AH=31h terminate-stay-resident. | HIGH / OV11 |
| `LEVEL4:0057` | `Level4Overlay_FreeResidentResources` | DOS AH=49h frees saved environment and resident PSP/allocation. | HIGH / OV11 |
| `LEVEL5:001C` | `Level5Overlay_GetResourceLayout` | Returns map/tiles/object/Bart paragraph locations in AX/BX/CX/DX. | HIGH / OV11 |
| `LEVEL5:0029` | `Level5Overlay_InstallResidentAndPublishIntF1` | Saves PSP/environment, publishes resident CS:0000 through INT F1, then DOS AH=31h terminate-stay-resident. | HIGH / OV11 |
| `LEVEL5:0057` | `Level5Overlay_FreeResidentResources` | DOS AH=49h frees saved environment and resident PSP/allocation. | HIGH / OV11 |
| `GENERAL:001C` | `GENERAL_Overlay_GetAuxResourceLayout` | Returns fixed resource-layout parameters; neutral semantics pending fully typed consumers. | MEDIUM-HIGH / OV11 |
| `GENERAL:002B` | `GENERAL_Overlay_GetMainResourceLayout` | Returns main resource-layout AX/BX/CX/DX/SI values. | MEDIUM-HIGH / OV11 |
| `GENERAL:003B` | `GENERAL_Overlay_InstallResidentAndPublishIntF1` | Publishes resident CS:0000 through INT F1 and DOS AH=31h TSR. | HIGH / OV11 |
| `GENERAL:0069` | `GENERAL_Overlay_FreeOrResizeResidentResources` | Resident public cleanup; exact free/resize sequence differs by family. | HIGH / OV11 |
| `PICTURES:001C` | `PICTURES_Overlay_GetAuxResourceLayout` | Returns fixed resource-layout parameters; neutral semantics pending fully typed consumers. | MEDIUM-HIGH / OV11 |
| `PICTURES:002B` | `PICTURES_Overlay_GetMainResourceLayout` | Returns main resource-layout AX/BX/CX/DX/SI values. | MEDIUM-HIGH / OV11 |
| `PICTURES:003B` | `PICTURES_Overlay_InstallResidentAndPublishIntF1` | Publishes resident CS:0000 through INT F1 and DOS AH=31h TSR. | HIGH / OV11 |
| `PICTURES:0069` | `PICTURES_Overlay_FreeOrResizeResidentResources` | Resident public cleanup; exact free/resize sequence differs by family. | HIGH / OV11 |
| `STARTUP:001C` | `STARTUP_Overlay_GetResourceLayout` | Returns fixed resource-layout parameters; neutral semantics pending fully typed consumers. | MEDIUM-HIGH / OV11 |
| `STARTUP:0026` | `STARTUP_Overlay_InstallResidentAndPublishIntF1` | Publishes resident CS:0000 through INT F1 and DOS AH=31h TSR. | HIGH / OV11 |
| `STARTUP:0054` | `STARTUP_Overlay_FreeOrResizeResidentResources` | Resident public cleanup; exact free/resize sequence differs by family. | HIGH / OV11 |
| `OCEAN:001C` | `OCEAN_Overlay_GetResourceLayout` | Returns fixed resource-layout parameters; neutral semantics pending fully typed consumers. | MEDIUM-HIGH / OV11 |
| `OCEAN:0026` | `OCEAN_Overlay_InstallResidentAndPublishIntF1` | Publishes resident CS:0000 through INT F1 and DOS AH=31h TSR. | HIGH / OV11 |
| `OCEAN:0054` | `OCEAN_Overlay_FreeOrResizeResidentResources` | Resident public cleanup; exact free/resize sequence differs by family. | HIGH / OV11 |

## Quarantined false function detections

Do not implement these as gameplay routines. They are documented because they occurred in previous Ghidra exports.

| Flat EXE offset | Old/quarantine name | Reason |
| --- | --- | --- |
| `0x4408` | `FALSE_POSITIVE_ExternalFarCallAlias_4408` | Ghidra created a function because an indirect FAR API pointer initially resolves here. 0x4408 is an internal loop tail (ADD SI,0Ah / DEC AX / jump), not a clean standalone function boundary. |
| `0x5150` | `FALSE_POSITIVE_SkateboardSplitAt5150` | Not a real function boundary. It splits UpdateBartSkateboardPhysics: bytes 514E-5150 form JMP +012B and the grounded path begins at 5151. An indirect FAR pointer caused Ghidra to split the code incorrectly. |
| `0x7F90` | `FALSE_POSITIVE_ExternalFarCallAlias_7F90` | Indirect FAR pointer target resolved by Ghidra into a zero-filled/data region; listing shows repeated ADD [BX+SI],AL from 00 bytes. Runtime callback pointer is external/patched. |
| `0xC22A` | `FALSE_POSITIVE_Level1ScriptData_C22A` | Address lies inside Level-1 direct-threaded script/data. Ghidra followed an indirect FAR callback pointer and decoded script bytes as a far function. |
| `0xCAD6` | `FALSE_POSITIVE_Level1Data_CAD6` | Address lies in Level-1 data, not meaningful x86 code. Ghidra reached it only through an indirect FAR callback pointer and decoded structured data as instructions. |

`68E8` is handled separately above as a real internal continuation, not as a standalone function or non-code payload.

## Research limits and chat corrections

- The 45-scene catalogue mixes confirmed DOS mechanisms with comparisons to other ports. Cinema bonus-show behavior, the complete Jebediah-head secret, and exact Maggie activation remain unresolved; no speculative function address is invented for them.
- The special render command behind the red poster/awning, common-overlay inventory/shop blitters, full boss/projectile behavior, checkpoint exactness and some alternate player/camera routes remain only partly modeled in the browser.
- The chat's early claim that Space is required for running was superseded by the Q-held landing mechanism in v0.9.5. Flag 1000 alone is not the red-paint indicator. Cheats grant unlimited lives, not invulnerability. These corrections are reflected above.
- FAR API slots such as root CS:7D91/7D95 are pointer storage, not root functions: V11 names them QueueMusicCommand/QueueSoundEffect. The executable targets are in the selected display overlay and are listed there.

## Catalogue coverage

- Root EXE / embedded Level-1 natives: **214** unique function entrypoints.
- Root internal code labels: **55** (not counted as independent functions).
- Named overlay executable entrypoints: **275**, counted per overlay and unique target offset; API aliases are collapsed.
- Quarantined false detections: **5**.
- Collision dispatch: **43 slots**, including the no-collision sentinel.

For future additions, record image/segment, exact entry offset, name, behavior, evidence and remaining uncertainty. Keep runtime implementation status separate from what has been recovered in DOS.
