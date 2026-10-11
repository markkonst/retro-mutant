# Level handlers

`LevelHandlerRegistry` owns one `LevelHandlerSet` per loaded level. Engine code calls typed methods directly, so IDE reference navigation remains useful.

Level 1 is split by concern under `level1/`:

- `Level1Handlers.ts` — composition root
- `Level1PlayerHandlers.ts` — `LevelSpecificPlayer_Level1` dispatch plus recovered skateboard/storefront ownership
- `Level1ShopHandlers.ts` — recovered `07F1/07F2` storefront state machine, stock and purchase semantics
- `Level1InventoryHandlers.ts` — inventory/world bindings such as the payphone COIN trigger
- `Level1NativeHandlers.ts` — recovered 096D FAR callbacks
- `Level1PresentationHandlers.ts` — speech-bubble/HUD bindings
- `Level1Constants.ts` — recovered Level-1-only tables and fixed operands

See `docs/LEVEL_HANDLERS.md` for lifecycle, the modeled Level-1 skateboard/storefront paths, remaining Level-1 branches and the Level 2-5 migration pattern.
