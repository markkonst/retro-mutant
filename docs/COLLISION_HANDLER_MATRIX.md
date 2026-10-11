# Collision handler matrix — v0.9.0

This table is the TypeScript counterpart of the DOS `Collision_HandlerJumpTable` at `0000:5F67`. `CollisionSystem` dispatches by the exported per-type `CollisionProfile.collision_index`, so object type transitions also switch collision semantics when their profile changes.

Fidelity meanings: **implemented** = the recovered branch is represented with the runtime state currently available; **partial** = its main/physical path is present but one or more level-specific external/global side effects remain deferred; **deferred** = the DOS handler depends on an auxiliary secondary/boss/linked record that this milestone does not yet produce. Deferred handlers deliberately do not substitute Bart body-AABB behavior.

| Index | DOS offset | TypeScript equivalent | Fidelity | Notes |
|---:|---:|---|---|---|
| 0 | `0x0000` | `None` | **implemented** | No collision handler. |
| 1 | `0x6650` | `DamageBartOrTransitionObject` | **implemented** | Parameter odd/zero/even split and invulnerability gate. |
| 2 | `0x6618` | `CollectAndIncrementCounter76F` | **implemented** | Score 60, sound 0Dh, life/counter increment and consume. |
| 3 | `0x66F1` | `TopContactBounceBreakOrDamage` | **implemented** | Feet/top test, break counters, velocity reflection, score and damage path. |
| 4 | `0x6BFD` | `CollectInventoryResource` | **partial** | Inventory BCD counters and known pickup effects implemented; presentation popup is not. |
| 5 | `0x6CEC` | `ConsumeObjectAndTriggerEvent7` | **implemented** | Score 100, goal decrement, sound 7 and consume. |
| 6 | `0x6817` | `CollectObjectiveAndAdvanceSequence` | **partial** | Consume/score/sound implemented; external progression table update is deferred. |
| 7 | `0x65DC` | `TransitionObjectAndLaunch` | **implemented** | Transition then low-nibble launch velocity table. |
| 8 | `0x65B5` | `AirborneOnlyTransition` | **implemented** | Airborne gate, body AABB, transition. |
| 9 | `0x66CE` | `GroundedOnlyTransition` | **implemented** | Grounded gate, body AABB, transition. |
| 10 | `0x6895` | `ResolveHorizontalSolidCollision` | **partial** | Physical side resolution is implemented; a small DOS global/facing gate is approximated. |
| 11 | `0x6D38` | `OneWayLandingAndOptionalTransition` | **implemented** | Center-X landing, 2px tolerance and low-byte landing counter. |
| 12 | `0x6DC6` | `LandOnMovingPlatform` | **implemented** | 1px landing tolerance and horizontal platform carry. |
| 13 | `0x66DC` | `DescendingAirborneTransition` | **implemented** | Airborne + non-negative vertical velocity + AABB. |
| 14 | `0x667A` | `SecondaryHitboxBossDamage3` | **deferred** | Needs reserved secondary boss hitbox and boss HP state. |
| 15 | `0x68DE` | `BartActionHitObject` | **implemented** | Uses the reconstructed facing-dependent Bart action line-hitbox (083Ah/0EB7h); low-5-bit hit counter and transition/consume path are active. |
| 16 | `0x697D` | `SpecialObjectType2RegionTransition` | **implemented** | Reserved type-2/cherry object region gate `Y>=8Eh`, `X=B28h..B60h`, then transition. |
| 17 | `0x6A07` | `SpecialObjectType4HitTransition` | **partial** | Reserved type-4/rocket point-hit geometry and `velocityX==0` gate implemented; projectile flight remains high-level. |
| 18 | `0x69AD` | `BartProjectileHitsBoss` | **deferred** | Needs projectile/action object and boss HP state. |
| 19 | `0x65C4` | `CollectInvulnerabilityPickup` | **implemented** | Score 50, invulnerability FAh and detach/despawn. |
| 20 | `0x6E50` | `ExternalCountdownTransition` | **deferred** | Depends on external countdown record pointer. |
| 21 | `0x6B87` | `LinkedObjectSpecialTransition` | **deferred** | Depends on linked source pointer and a hard-coded level sequence. |
| 22 | `0x6E70` | `FeetOnlyDamageOrTransition` | **implemented** | Handler-1 semantics with Bart top shifted down 20px. |
| 23 | `0x6B47` | `LinkedObjectProximityTransition` | **partial** | Runtime type lookup/proximity is implemented; source-link semantics remain approximate. |
| 24 | `0x6480` | `SpecialObjectType8HitElseHazard` | **implemented** | Type-8 dart point-hit clears projectile and transitions; miss/no dart follows the event-7 consume fallback. |
| 25 | `0x6A6D` | `SpecialObjectType10ClearIndexedFlag` | **deferred** | Needs reserved type-10 action object and indexed level-flag table. |
| 26 | `0x6AC7` | `SpecialObjectType12ClearFlagAndCount` | **deferred** | Needs reserved type-12 action object and level counters. |
| 27 | `0x5FBD` | `SpecialObjectType14HitElseEvent` | **implemented** | Type-14 slingshot point-hit interception plus the original flags-bit0 event fallback. |
| 28 | `0x6054` | `FallingLargeObjectHazardOrTopContact` | **implemented** | Falling 48x50 hazard region then handler-3 fallback. |
| 29 | `0x6086` | `DamageBartIfObjectField2CZero` | **implemented** | Low byte of object +2Ch gates handler 1. |
| 30 | `0x617B` | `AABBIncrementCounter780IfReady` | **implemented** | 0784/0766/0780 gates and latch update. |
| 31 | `0x60D6` | `AirbornePatternMatchTransition` | **implemented** | Airborne AABB, low-nibble pattern table, +2/wrap state and transition. |
| 32 | `0x60AB` | `CollectAndAdvanceCounter76A` | **implemented** | 1Ch gate, score 50, +4 counter, consume. |
| 33 | `0x6090` | `PlatformLandingAndToggle76C` | **implemented** | Moving-platform landing plus 076C toggle at 076A==1Ch. |
| 34 | `0x61DB` | `BounceBartUpward` | **implemented** | Airborne/gravity phase; subtract 0100h unless already faster than -5.0. |
| 35 | `0x62DD` | `SpecialObjectType16DestroyAndAdvance` | **deferred** | Needs reserved type-16 object; state-0817 update depends on its hitbox. |
| 36 | `0x6338` | `MovingPlatformLandingWithDisplacement` | **partial** | DOS Y=-6 landing and +2Ch displacement implemented; +2Ch producer/camera override are approximated. |
| 37 | `0x63C6` | `MovingHazardDamageOrLandingTransition` | **implemented** | Falling hazard region and stationary descending-feet transition path. |
| 38 | `0x6258` | `SpecialObjectType8HitElseDamage` | **implemented** | Type-8 dart point-hit clears projectile/transitions; miss uses normal Bart-body damage fallback. |
| 39 | `0x612E` | `SecondaryHitboxStopTargetVelocityX` | **deferred** | Needs secondary hitbox at 089Ah and linked target pointer 079Dh. |
| 40 | `0x619F` | `ConsumeCounter780AndMarkProgress` | **partial** | Counter/goals/progress loop implemented; progress-source record activation is deferred. |
| 41 | `0x61F8` | `SecondaryHitboxDamageAndLaunchObject` | **deferred** | Needs secondary hitbox/linked target HP state. |
| 42 | `0x6440` | `RisingObjectActivateLinkedRecords` | **partial** | Rising/y/latch gate implemented; writes to linked persistent source records are deferred. |

The automated `tools/smoke-collision-matrix.mjs` test verifies all 43 indices and DOS offsets and checks every collision profile exported from Levels 1–5 against this table. `tools/smoke-collision-extended.mjs` exercises representative DOS-specific branches rather than only table presence.


v0.8 regression-tests zero-height handler-9 clothesline triggers and handler-15 action-hitbox behavior through `tools/smoke-clothesline.mjs` and `tools/smoke-inventory.mjs`.


v0.8 also exercises reserved projectile branches for handlers 16/17/24/27/38 through the inventory/action runtime. The current automated fidelity count is **26 implemented / 8 partial / 9 deferred**.
