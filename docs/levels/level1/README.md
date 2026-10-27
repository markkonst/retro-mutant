# Level 1: street events, items and Nelson

[Level index](../README.md) · [Handler API](../../LEVEL_HANDLERS.md) · [Detailed story evidence](../../LEVEL1_STORY_RESEARCH.md)

Level 1 is the main reconstruction target. The original scripts run in the shared VM; its embedded native callbacks and location-specific player rules have TypeScript handlers. Full completion through an ordinary playthrough is not yet certified.

## 1. Progression

Purple objectives and helper tokens are separate. Purple-object interactions decrement the objective count; clearing the goals removes the end barricade. Alien tokens spell MAGGIE and enable the helper source. Collecting a letter does not reduce purple goals.

The closed barricade must allow retreat. Once Nelson's script enters the arena, the original camera/player bounds intentionally restrict return to the street. The gate and arena are different states.

## 2. Story and item chains

| Event | Implemented chain | Limits / test |
| --- | --- | --- |
| Payphone / Moe | COIN at the recovered location activates the source; ringing, speech children, native random branch and Moe run through scripts | Text layout/RNG exactness remain approximate; story-VM regression |
| Whistle / Grandpa | Correct location activates Grandpa, produces eight coins and runs departure; one-shot source behavior is checked | Isolated setup; items/story regression |
| Cinema sign | Timer 400 or 200 spawns the passer-by; spraying changes type, removes one purple goal and starts angry animation | Separate entrance/interior/bonus show unproven |
| Jebediah | Rocket hits purple bird; original bird departure and AHEAD message; persistent source removal | Separate head-jumping/life reward unproven; message presentation reconstructed |
| Aliens / Maggie | Stomp six aliens, collect their death-script tokens, enable Maggie's source | Letter layout reconstructed; secrets regression |
| Maggie / Nelson | Maggie spawns a ball; airborne Bart redirects it; collision with Nelson removes three HP | Actual scripts/collision chain tested in an isolated arena |
| Nelson | Arena native registers boss; right-facing FIRE shots remove one HP from ten; defeat script sets level-finished | No claim of exact completion screen or full route validation |
| Rockets | Place, ignite at fuse, fly, explode or expire; all six recovered target placements checked | Tests grant inventory and isolate the targets |
| Bombs | Original signed motion, fall wait and explosion; designated target hit and miss tested | Reserved action slot, not an ordinary pool object |
| Shops / wrench | Storefront interaction and BCD purchases; wrench activates the awning's source countdown | Door/art/popup rendering includes documented substitutes |

The cinema and statue interpretations are based on the inspected DOS paths. Lack of evidence for another secret is not proof it never existed. See [the detailed audit](../../LEVEL1_STORY_RESEARCH.md) for exact source indices and addresses.

## 3. X-ray

Item 1 sets DS:07DE to FAh; each gameplay update decrements it. Using it again turns it off. The original palette bank B makes the scene orange/brown. Flag-0400 objects use a descriptor offset of +48h, equal to six 12-byte descriptors.

The browser now implements both the palette change and 250-update expiry. X-RAY SPECS starts selected: press/release A without Space. See [assets](../../assets/README.md#5-palette-a-palette-b-and-x-ray) for encoding.

## 4. Player, shops and camera

The level-specific player dispatcher handles the recovered skateboard zone, storefront ownership and boss action setup. Q-held landing enables running through shared player logic. Skateboard camera behavior is not yet fully DOS-exact.

The three supported shop entrances use Q while standing at their recovered location. O/P selects, Space buys and A leaves. Stock, BCD coins and action state are implemented; some common-overlay graphics use substitutes.

Nelson's arena sets the left boundary to 30B7h and the right bound to 31E3h. This restriction starts after the arena script loads, not merely because Bart touches the closed street gate.

## 5. Code ownership

All files below are in [src/game/levels/level1](../../../src/game/levels/level1).

| File | Responsibility |
| --- | --- |
| Level1Handlers.ts | Compose the level services |
| Level1PlayerHandlers.ts | Player/skateboard/storefront/boss-action routing |
| Level1ShopHandlers.ts | Shop state machine, stock and purchase behavior |
| Level1InventoryHandlers.ts | Location-specific item bindings |
| Level1NativeHandlers.ts | Original 096D FAR callbacks and branch outcomes |
| Level1PresentationHandlers.ts | Speech and HUD bindings |
| Level1Constants.ts | Named fixed operands and recovered tables |

Shared helper-token collection, collisions, audio and reserved projectile execution stay in their corresponding engine components. Story behavior is often distributed across source data, an original script and a small native routine; do not replace the chain with a hardcoded cutscene.

## 6. Validation and remaining work

Run `npm run smoke`. Relevant programs include level1-natives, level1-shop, level1-skateboard, level1-v096, level1-boss, rockets, level1-items-story and level1-secrets.

The event regressions intentionally isolate mechanics using item grants, positioning and sometimes debug invulnerability. Remaining work includes full route comparison against DOS, uncommon source gates, linked collision paths, original popup/completion rendering, camera variants and RNG/timing.

This chapter describes current coverage, not a 100% completion claim.
