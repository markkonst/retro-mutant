import type { LevelInventoryItemUseEvent, LevelRuntimeServices } from "../LevelHandlers.js";

/** Level-1 inventory/world interactions. */
export class Level1InventoryHandlers {
  constructor(private readonly services: LevelRuntimeServices) {}

  handleInventoryItemUse(event: LevelInventoryItemUseEvent): boolean {
    switch (event.itemId) {
      case 2:
        return this.useCoinAtPayphone(event);
      default:
        return false;
    }
  }

  /** COIN at BartY=62h / X>>3=69h activates LevelRuntimeConfig progress source. */
  private useCoinAtPayphone(event: LevelInventoryItemUseEvent): boolean {
    if (event.itemCount(2) <= 0 || event.bart.y !== 0x62 || (event.bart.x >>> 3) !== 0x69) {
      event.resetSelection("COIN: wrong Level-1 payphone location");
      return true;
    }
    const offset = this.services.level.playerConfig.progress_source_offset;
    const flags = this.services.sourceFlags(offset);
    if (flags === null || flags === 0) {
      event.resetSelection("COIN: Level-1 payphone source inactive");
      return true;
    }
    this.services.activateSourceRecord(offset, 0x8000, "or");
    event.consumeItem(2);
    event.note("COIN activated Level-1 payphone source");
    return true;
  }
}
