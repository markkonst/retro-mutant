# Inventory + DOS HUD — v0.9.0

## Runtime inventory slots

| # | Name | common graphics offset | count/state |
|---:|---|---:|---|
| 0 | EXIT | `0000` | selector command |
| 1 | X-RAY SPECS | `1424` | always selectable; toggles alternate graphics timer |
| 2 | COIN | `2810` | packed BCD |
| 3 | SPRAYCAN | `2804` | packed BCD + Level-1 `0815/0816` meter |
| 4 | CHERRY BOMB | `2808` | packed BCD |
| 5 | ROCKET | `280C` | packed BCD |
| 6 | WRENCH | `2800` | packed BCD / level source gate |
| 7 | MAGNET | `2818` | packed BCD / Level-3 location gate |
| 8 | WHISTLE | `2814` | packed BCD / source gate |
| 9 | DONUTS | `2824` | packed BCD |
| 10 | SLINGSHOT | `281C` | packed BCD + `0782` 12-step submeter |
| 11 | DART GUN | `2820` | packed BCD + `0781` 12-step submeter |
| 12 | KEY | `1E24` | packed BCD / paired-location teleport |
| 13 | PAUSE | `0000` | selector command |

The metadata offsets above are recovered from the original game. v0.8 preserves them but does not yet decode the `GENERAL.OVL` off-screen common icon sheet into pixel-exact standalone icon rasters.

## Input/state flow

- Hold inventory input (`I`/Down in the browser mapping) to set inventory-held state.
- While held, FIRE advances through available entries; empty count entries are skipped.
- Repeat delay is `0x14`; inventory display timeout is `0xFA`.
- Releasing inventory runs the item-index jump-table path.
- Spraycan, slingshot and dart gun use the separate Bart action/weapon update path, matching the DOS split rather than becoming a modern equipped-item abstraction.

## Action hitbox

Handler 15 uses a separate action object/hitbox. v0.8 reconstructs that line hitbox from Bart facing and action state. The normal 12×24 Bart body box is not substituted.

## HUD

The logical display is 320×200. v0.8 reserves the lower strip for a DOS-style HUD and uses the original 8×8 font bytes extracted from `VGA.OVL`. Runtime fields shown include score, lives, timer, goals, current inventory/count and per-level spray/slingshot/dart/special meters.

The previous HTML HUD remains available behind the **modern debug HUD** checkbox.

## v0.8 input/action update

Browser `keyup` now explicitly releases FIRE (`F`/Enter) and inventory (`I`/Down), while blur/focus loss still clears all held gameplay inputs. Spray charge is consumed only while FIRE is actually held; Bart also receives the recovered action-animation descriptor offset and the spray line uses the recovered action-object positioning.

## Exactness boundary

Recovered/exact enough for this milestone:
- inventory slot order/names and common graphics offsets;
- packed-BCD counts;
- selection/repeat/timeout behavior;
- item-use dispatch conditions for recovered items;
- X-ray state;
- source-gated wrench/magnet/whistle/coin behavior;
- key teleport endpoints;
- spray action hitbox and ammo meter;
- slingshot/dart projectile state and 12-step meter consumption;
- original VGA 8×8 font bytes;
- HUD values sourced from the same runtime state.

Still high-level / not pixel-exact:
- common `GENERAL.OVL` inventory icon raster decoding;
- cherry-bomb/rocket/donut transient object graphics/scripts;
- projectile sprite graphics and some projectile lifetime/collision special cases;
- alternate-graphics palette/sprite-bank visual effect for X-ray.
