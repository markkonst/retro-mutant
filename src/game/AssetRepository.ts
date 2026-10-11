import {
  BartPlayerConfig,
  CollisionProfile,
  EventMessagesJson,
  LevelNumber,
  LoadedLevel,
  ManifestJson,
  ObjectScriptsJson,
  ObjectTypeFlow,
  RuntimeDataJson,
  SpriteDescriptor,
} from "./types.js";

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
  }
  return await response.json() as T;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  return await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load image ${url}`));
    image.src = url;
  });
}

function descriptorPath(level: LevelNumber, descriptorIndex: number): string {
  return `/data/level${level}/object_frames/object_${descriptorIndex.toString().padStart(3, "0")}.png`;
}

function bartDescriptorPath(level: LevelNumber, descriptorIndex: number): string {
  return `/data/level${level}/bart_frames/bart_${descriptorIndex.toString().padStart(3, "0")}.png`;
}

function collectReferencedDescriptors(scripts: ObjectScriptsJson): Set<number> {
  // Descriptor frames 0..3 are the reserved Bart spray action-object visuals.
  // They are addressed by render offsets 00h/0Ch/18h/24h rather than by
  // ordinary object scripts, so the script-reference scan cannot discover them.
  const result = new Set<number>([0, 1, 2, 3]);
  for (const flow of scripts.object_types) {
    for (const index of flow.referenced_object_descriptor_indices) {
      result.add(index);
    }
    for (const instruction of flow.instructions) {
      if (instruction.name === "SetStaticFrame") {
        const index = instruction.args["descriptor_index"];
        if (typeof index === "number") result.add(index);
      } else if (instruction.name === "SetAnimation") {
        const indices = instruction.args["descriptor_indices"];
        if (Array.isArray(indices)) {
          for (const value of indices) {
            if (typeof value === "number") result.add(value);
          }
        }
      }
    }
  }
  return result;
}

export class AssetRepository {
  private readonly cache = new Map<LevelNumber, Promise<LoadedLevel>>();

  loadLevel(level: LevelNumber): Promise<LoadedLevel> {
    let existing = this.cache.get(level);
    if (!existing) {
      existing = this.loadLevelInternal(level);
      this.cache.set(level, existing);
    }
    return existing;
  }

  private async loadLevelInternal(level: LevelNumber): Promise<LoadedLevel> {
    const base = `/data/level${level}`;
    const [manifest, runtime, scripts, background, playerConfig, eventMessages] = await Promise.all([
      fetchJson<ManifestJson>(`${base}/manifest.json`),
      fetchJson<RuntimeDataJson>(`${base}/runtime_data.json`),
      fetchJson<ObjectScriptsJson>(`${base}/object_scripts.json`),
      loadImage(`${base}/background_map.png`),
      fetchJson<BartPlayerConfig>(`${base}/player_runtime.json`),
      fetchJson<EventMessagesJson>(`${base}/event_messages.json`),
    ]);

    // v0.5 names LevelRuntimeConfig+0Eh explicitly. Older decoded asset
    // folders exported this same byte as `variant`, so preserve import compatibility.
    if (!Number.isFinite(playerConfig.initial_goals_bcd)) {
      playerConfig.initial_goals_bcd = playerConfig.variant;
    }

    const descriptorByIndex = new Map<number, SpriteDescriptor>(
      manifest.runtime.object_descriptors.map((descriptor) => [descriptor.index, descriptor]),
    );
    const bartDescriptorByIndex = new Map<number, SpriteDescriptor>(
      manifest.runtime.bart_descriptors.map((descriptor) => [descriptor.index, descriptor]),
    );
    const flowByType = new Map<number, ObjectTypeFlow>(
      scripts.object_types.map((flow) => [flow.type_id, flow]),
    );
    const collisionByType = new Map<number, CollisionProfile>(
      runtime.collision_profiles.map((profile) => [profile.type_id, profile]),
    );

    const imageByDescriptorIndex = new Map<number, HTMLImageElement>();
    const referenced = collectReferencedDescriptors(scripts);
    // While X-RAY/07DE is active, DOS adds 48h = six 0Ch descriptors to
    // flag-0400 objects. Those alternate frames are often absent from direct
    // script references, so preload every in-bank +6 counterpart.
    for (const index of [...referenced]) {
      if (descriptorByIndex.has(index + 6)) referenced.add(index + 6);
    }
    if (level === 1) {
      // DOS common-overlay graphics used by Bart's rocket action and the
      // Level-1 storefront are not referenced by ordinary object scripts.
      // The decoded object bank contains recovered surrogates for them.
      for (const index of [4, 5, 6, 7, 22, 23, 24, 25, 26, 27]) referenced.add(index);
    }
    await Promise.all([...referenced].map(async (descriptorIndex) => {
      try {
        const image = await loadImage(descriptorPath(level, descriptorIndex));
        imageByDescriptorIndex.set(descriptorIndex, image);
      } catch (error) {
        console.warn(error);
      }
    }));

    const bartImageByDescriptorIndex = new Map<number, HTMLImageElement>();
    await Promise.all(manifest.runtime.bart_descriptors.map(async (descriptor) => {
      try {
        const image = await loadImage(bartDescriptorPath(level, descriptor.index));
        bartImageByDescriptorIndex.set(descriptor.index, image);
      } catch (error) {
        console.warn(error);
      }
    }));

    const eventMessageByKey = new Map(eventMessages.messages.map((m) => [`${m.segment}:${m.offset}`, m]));

    return {
      level,
      manifest,
      runtime,
      scripts,
      background,
      playerConfig,
      descriptorByIndex,
      imageByDescriptorIndex,
      bartDescriptorByIndex,
      bartImageByDescriptorIndex,
      flowByType,
      collisionByType,
      eventMessages,
      eventMessageByKey,
    };
  }
}
