#!/usr/bin/env python3
"""
Simpsons DOS LEVEL*.OVL asset loader
====================================

Loads the *flat decompressed DOS load images* produced by the custom PKLITE
unpacker used for The Simpsons: Bart vs. the Space Mutants (DOS):

    LEVEL1.OVL.image.bin ... LEVEL5.OVL.image.bin

The loader derives the resource boundaries from the tiny resident interface
stub at offset 0x001C instead of hard-coding Level-1 offsets.  It decodes:

* column-major 11-row background maps (big-endian tile IDs)
* 16x16 4bpp planar background tiles
* 320x272 object sprite sheets (four colour planes + zero-filled reserved block)
* 320x288 Bart sprite sheets (four colour planes + zero-filled reserved block)

When SIMPSONS.EXE.image.bin is available, it additionally loads the per-level
resident metadata that is needed to interpret/render the graphics:

* LevelRuntimeConfig root pointers
* graphics palette bank A and B
* object SpriteDescriptor[]
* Bart SpriteDescriptor[]
* per-level LevelObjectSource[], CollisionProfile[] and StaticTerrain[]
* direct-threaded object scripts, decoded to instruction lists + CFG edges

This module intentionally does NOT implement PKLITE decompression.  The packed
LEVEL*.OVL files are MZ executables and must first be converted to the flat
*.OVL.image.bin form by the project's custom PKLITE decoder.  A directory or
UNPACKED.zip containing those images can be passed directly to this script.

Examples
--------

    # Inspect all five levels in UNPACKED.zip
    python simpsons_ovl_assets.py UNPACKED.zip

    # Decode and export PNG/JSON assets for all levels
    python simpsons_ovl_assets.py UNPACKED.zip --export decoded_assets

    # Export only JSON metadata + object-script flows (Pillow not needed)
    python simpsons_ovl_assets.py UNPACKED.zip --json-only decoded_json

    # Load one level image with resident metadata from the EXE image
    python simpsons_ovl_assets.py LEVEL3.OVL.image.bin \
        --exe SIMPSONS.EXE.image.bin --export level3_assets

Python API
----------

    from simpsons_ovl_assets import SimpsonsAssets

    assets = SimpsonsAssets.open("UNPACKED.zip")
    level1 = assets.levels[1]
    print(level1.map.columns, level1.tile_bank.used_tile_count)
    pixels = level1.tiles.decode_tile(42)       # IndexedBitmap 16x16
    frame  = level1.object_frames[10]           # SpriteFrame, when EXE supplied

Pillow is only required for --export; loading/decoding works with the standard
library alone.
"""

from __future__ import annotations

import argparse
import io
import json
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
import re
import struct
import sys
import zipfile
from typing import Dict, Iterable, Iterator, List, Mapping, Optional, Sequence, Tuple, Union


# ---------------------------------------------------------------------------
# Constants recovered from SIMPSONS.EXE / LEVEL*.OVL
# ---------------------------------------------------------------------------

LEVEL_DATA_SEGMENTS: Mapping[int, int] = {
    1: 0x096D,
    2: 0x0C8C,
    3: 0x0F6B,
    4: 0x1239,
    5: 0x1556,
}

MAP_ROWS = 11
TILE_WIDTH = 16
TILE_HEIGHT = 16
TILE_BYTES = 128

SPRITE_SHEET_WIDTH = 320
SPRITE_BYTES_PER_ROW = SPRITE_SHEET_WIDTH // 8  # 40
SPRITE_STORAGE_BLOCKS = 5  # four colour planes + one zero-filled reserved block
OBJECT_SHEET_HEIGHT = 272
BART_SHEET_HEIGHT = 288
OBJECT_SHEET_BYTES = SPRITE_STORAGE_BLOCKS * SPRITE_BYTES_PER_ROW * OBJECT_SHEET_HEIGHT  # 0xD480
BART_SHEET_BYTES = SPRITE_STORAGE_BLOCKS * SPRITE_BYTES_PER_ROW * BART_SHEET_HEIGHT      # 0xE100

LEVEL_RUNTIME_CONFIG_SIZE = 0x78
SPRITE_DESCRIPTOR_SIZE = 12
LEVEL_OBJECT_SOURCE_SIZE = 10
COLLISION_PROFILE_SIZE = 12
STATIC_TERRAIN_SIZE = 6

# Mutable embedded level-block lengths recovered from LevelMutableBackupDescriptors.
LEVEL_DATA_LENGTHS: Mapping[int, int] = {
    1: 0x31E6,
    2: 0x2DE2,
    3: 0x2CDD,
    4: 0x31C2,
    5: 0x38C7,
}

# Core direct-threaded object-script handlers.  The handler word is stored
# literally in the level script stream; SI points immediately after it when
# the handler begins.  arg_bytes is how many bytes the core handler consumes.
SCRIPT_HANDLER_SPECS: Mapping[int, Tuple[str, int]] = {
    0x5B99: ("PlaySound", 2),
    0x5BA6: ("SetAnimation", 6),
    0x5BCA: ("SetStaticFrame", 2),
    0x5BEE: ("Goto", 2),
    0x5BF3: ("SetVelocityX", 2),
    0x5C03: ("SetVelocityY", 2),
    0x5C13: ("SetAccelerationX", 2),
    0x5C1F: ("SetAccelerationY", 2),
    0x5C2B: ("DetachSource", 0),
    0x5C4B: ("Despawn", 0),
    0x5C6C: ("SetTypeAndPersistY", 2),
    0x5C83: ("ExternalSpecial3Bytes", 3),
    0x5C99: ("GotoIfXAtOrRightOfBart", 2),
    0x5CAD: ("SetSourceTypeFlags", 4),
    0x5CC2: ("StopMotion", 0),
    0x5CDF: ("WaitUntilYAtLeast", 2),
    0x5CF9: ("SetGlobalEventData", 12),
    0x5D06: ("DecrementObjectiveCounterBCD", 0),
    0x5D21: ("BounceSlowdownStep", 0),
    0x5D66: ("SpawnChild", 8),
    0x5E1B: ("SetLevelCameraState", 4),
    0x5E56: ("TriggerGlobalEventSound4", 0),
    0x5E7F: ("SetGlobalRange", 4),
    0x5E98: ("SetObjectFlag1000", 0),
    0x5EA0: ("ClearObjectFlag1000", 0),
    0x5EAF: ("SetGlobalTargets", 4),
    0x5EC4: ("SpawnChildAfterCurrent", 8),
    0x5EE1: ("CallNativeFar", 4),
}

# Names currently proven for Level-1 native callbacks.  Other levels are
# intentionally left as LevelNNative_xxxx rather than guessed.
LEVEL1_NATIVE_NAMES: Mapping[int, str] = {
    0x30D2: "Level1_RandomStep",
    0x3117: "Level1Native_SetObjectFlag1000",
    0x311D: "Level1Native_SetObjectLinkField2A",
    0x3127: "Level1Native_ToggleFlag1000AndCountdownField2A",
    0x313C: "Level1Native_RegisterCurrentObjectAsBoss",
    0x3147: "Level1Native_NelsonChooseAttackOrDeath",
    0x315F: "Level1Native_ToggleLevelFinishedFlag",
    0x3165: "Level1Native_BranchAtTimer400Or200",
    0x3179: "Level1Native_BranchIfType67AtRecord0599",
    0x3187: "Level1Native_SelectRandomScriptFromTable",
    0x3198: "Level1Native_SetRandomVelocityX",
    0x31AD: "Level1Native_SetAccelYFromBartDistance",
    0x31CB: "Level1Native_SetRuntimeFlag0080",
    0x31D2: "Level1Native_SetLocalEventFlag",
    0x31D9: "Level1Native_BranchIfLocalEventFlagSet",
}

# Script_CallNativeFar invokes the level callback after advancing SI past the
# four-byte far pointer.  Most callbacks preserve SI; only exceptions are
# listed here.  Outcomes are (kind,value):
#   rel N  -> resume at next_pc + N
#   abs N  -> resume at level offset N
#   unknown -> callback can redirect SI dynamically; the guaranteed CFG stops
#              at that edge instead of inventing a target.
# These effects were recovered from the native x86 routines in this release.
NATIVE_FLOW_EFFECTS: Mapping[Tuple[int, int], Tuple[Tuple[str, Optional[int]], ...]] = {
    (1,0x311D): (("rel",2),),
    (1,0x3127): (("rel",0),("rel",4)),
    (1,0x3147): (("rel",0),("abs",0x23A8),("rel",4)),
    (1,0x3165): (("rel",0),("rel",4)),
    (1,0x3179): (("rel",0),("rel",4)),
    (1,0x3187): tuple(("abs",x) for x in (0x24B2,0x2522,0x2592,0x2602,0x2672)),
    (1,0x31D9): (("rel",0),("rel",4)),

    (2,0x293B): (("rel",2),),
    (2,0x2945): (("rel",0),("rel",4)),
    (2,0x2965): (("rel",0),("abs",0x299A)),
    (2,0x2970): (("abs",0x299A),),
    (2,0x2984): (("rel",0),("rel",-14)),
    (2,0x29AA): tuple(("abs",x) for x in (0x280F,0x284B,0x289F,0x28BB,0x28E3,0x28D7,0x2893,0x2887)),
    (2,0x2A27): (("rel",0),("rel",4)),
    (2,0x2A44): (("rel",0),("abs",0x1B35)),
    (2,0x2A6A): (("rel",0),("rel",4)),
    (2,0x2B01): (("rel",0),("rel",4),("abs",0x1DA1)),
    (2,0x2B1E): (("rel",0),("rel",4)),
    (2,0x2B4C): (("rel",0),("rel",4)),
    (2,0x2B57): (("rel",0),("abs",0x1CEB)),
    (2,0x2B7D): (("rel",0),("abs",0x1B35)),

    (3,0x252B): (("rel",0),("abs",0x2251)),
    (3,0x2540): (("rel",0),("rel",4)),
    (3,0x256C): (("rel",0),("rel",4)),
    (3,0x25EF): (("abs",0x2603),),
    (3,0x2653): (("rel",2),),
    (3,0x265D): (("rel",0),("rel",4)),
    (3,0x2686): (("rel",0),("abs",0x2603)),
    (3,0x26A8): (("rel",0),("rel",4)),
    (3,0x26E0): (("rel",0),("abs",0x1AAF)),
    (3,0x26FA): (("rel",0),("rel",4)),
    (3,0x2706): (("rel",0),("rel",4)),
    (3,0x2739): (("rel",0),("abs",0x2603)),
    (3,0x2759): (("rel",0),("abs",0x2603)),
    (3,0x2796): (("abs",0x1D6B),("abs",0x1D77),("abs",0x1D83)),
    (3,0x27E7): (("abs",0x1F0F),("abs",0x1E85),("abs",0x1DFB)),
    (3,0x2807): (("rel",0),("abs",0x1DD7)),
    (3,0x2C9C): (("rel",0),("rel",4)),

    (4,0x2C79): (("rel",0),("abs",0x2B4E)),
    (4,0x2CE8): (("abs",0x2CFC),),
    (4,0x2D43): (("rel",2),),
    (4,0x2D4D): (("rel",0),("rel",4)),
    (4,0x2D62): (("rel",0),("rel",4)),
    (4,0x2DF8): (("rel",0),("abs",0x2833),("abs",0x2887),("abs",0x284F),("abs",0x286B)),
    (4,0x2E05): (("rel",0),("abs",0x2833),("abs",0x2887),("abs",0x284F),("abs",0x286B)),
    (4,0x2E12): (("rel",0),("abs",0x2833),("abs",0x2887),("abs",0x284F),("abs",0x286B)),
    (4,0x2E1F): (("rel",0),("abs",0x2833),("abs",0x2887),("abs",0x284F),("abs",0x286B)),
    (4,0x2F2C): (("unknown",None),),
    (4,0x3022): (("rel",0),("abs",0x2CFC)),
    (4,0x3084): (("rel",0),("rel",4)),
    (4,0x30A3): (("rel",0),("rel",4)),
    (4,0x30BB): (("rel",0),("rel",4)),
    (4,0x3121): (("rel",0),("rel",4)),
    (4,0x3141): (("rel",0),("rel",4)),

    (5,0x1A0A): (("rel",0),("rel",4)),
}

# A small number of Level-5 scripts call root-segment FAR helpers rather than
# level-local natives.  Their SI effects are recovered here as part of the same
# script ABI.
EXTERNAL_NATIVE_FLOW_EFFECTS: Mapping[Tuple[int, int], Tuple[Tuple[str, Optional[int]], ...]] = {
    (0x0000, 0x388D): (("rel",0),),
    (0x0000, 0x38B7): (("rel",0),("rel",4)),
}


class AssetFormatError(RuntimeError):
    """Raised when an input does not match the recovered Simpsons asset format."""


class PackedOverlayError(AssetFormatError):
    """Raised when a packed MZ LEVEL*.OVL is supplied instead of a flat image."""


# ---------------------------------------------------------------------------
# Small value/data classes
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class ResourceLayout:
    """Resource boundaries returned by LEVELn.OVL:GetResourceLayout (offset 001C)."""

    ax_map_paragraph: int
    bx_tiles_paragraph: int
    cx_object_sprites_paragraph: int
    dx_bart_sprites_paragraph: int
    image_size: int

    @property
    def map_start(self) -> int:
        return self.ax_map_paragraph << 4

    @property
    def object_sprites_start(self) -> int:
        return self.cx_object_sprites_paragraph << 4

    @property
    def bart_sprites_start(self) -> int:
        return self.dx_bart_sprites_paragraph << 4

    @property
    def tiles_start(self) -> int:
        return self.bx_tiles_paragraph << 4

    @property
    def map_size(self) -> int:
        return self.object_sprites_start - self.map_start

    @property
    def object_sprites_size(self) -> int:
        return self.bart_sprites_start - self.object_sprites_start

    @property
    def bart_sprites_size(self) -> int:
        return self.tiles_start - self.bart_sprites_start

    @property
    def tile_bank_size(self) -> int:
        return self.image_size - self.tiles_start


@dataclass(frozen=True)
class IndexedBitmap:
    """8-bit pixel indices with optional 1-bit opacity mask (1 = opaque)."""

    width: int
    height: int
    pixels: bytes
    opaque_mask: Optional[bytes] = None

    def __post_init__(self) -> None:
        expected = self.width * self.height
        if len(self.pixels) != expected:
            raise ValueError(f"pixel buffer is {len(self.pixels)} bytes, expected {expected}")
        if self.opaque_mask is not None and len(self.opaque_mask) != expected:
            raise ValueError("mask size does not match bitmap")

    def crop(self, x: int, y: int, width: int, height: int) -> "IndexedBitmap":
        if x < 0 or y < 0 or width < 0 or height < 0:
            raise ValueError("negative crop rectangle")
        if x + width > self.width or y + height > self.height:
            raise ValueError(
                f"crop {x},{y} {width}x{height} exceeds {self.width}x{self.height} bitmap"
            )
        out = bytearray(width * height)
        out_mask = bytearray(width * height) if self.opaque_mask is not None else None
        for row in range(height):
            src = (y + row) * self.width + x
            dst = row * width
            out[dst:dst + width] = self.pixels[src:src + width]
            if out_mask is not None and self.opaque_mask is not None:
                out_mask[dst:dst + width] = self.opaque_mask[src:src + width]
        return IndexedBitmap(width, height, bytes(out), bytes(out_mask) if out_mask is not None else None)


@dataclass(frozen=True)
class PaletteBank:
    """64-byte level graphics palette bank: 16 adapter-map bytes + 16 VGA RGB6 triples."""

    adapter_map: Tuple[int, ...]
    rgb6: Tuple[Tuple[int, int, int], ...]

    @property
    def rgb8(self) -> Tuple[Tuple[int, int, int], ...]:
        """Raw VGA DAC entries converted from 6-bit to 8-bit RGB."""
        return tuple(
            tuple(round(component * 255 / 63) for component in rgb)  # type: ignore[misc]
            for rgb in self.rgb6
        )

    @property
    def logical_rgb8(self) -> Tuple[Tuple[int, int, int], ...]:
        """Adapter-mapped diagnostic palette view.

        Do not use this as the default decoded VGA palette.  The known-good
        Level-1 background matches the 16 DAC RGB triples directly.  The 16
        preceding bytes are retained as original adapter/display-state data,
        but blindly applying them as a PNG colour remap produces wrong colours.
        """
        dac = self.rgb8
        return tuple(dac[index & 0x0F] for index in self.adapter_map)


@dataclass(frozen=True)
class SpriteDescriptor:
    index: int
    source_offset: int
    width_units: int
    height_pixels: int
    x_offset: int
    y_offset: int
    unknown_0a: int

    @property
    def width_pixels(self) -> int:
        # Recovered renderer convention: descriptor width unit = 16 pixels.
        return self.width_units * 16

    @property
    def source_y(self) -> int:
        # Descriptor offsets use a logical 200-byte row stride = 40 byte-columns * 5 planes.
        return self.source_offset // 200

    @property
    def source_x(self) -> int:
        return ((self.source_offset % 200) // 5) * 8


@dataclass(frozen=True)
class SpriteFrame:
    descriptor: SpriteDescriptor
    bitmap: IndexedBitmap


@dataclass(frozen=True)
class LevelObjectSource:
    index: int
    offset: int
    stream_x: int
    x: int
    y: int
    type_offset: int
    flags: int

    @property
    def type_id(self) -> int:
        return self.type_offset // 2


@dataclass(frozen=True)
class CollisionProfile:
    type_id: int
    offset: int
    handler_table_offset: int
    x_offset: int
    width: int
    y_offset: int
    height: int
    parameter: int

    @property
    def collision_index(self) -> int:
        return self.handler_table_offset // 2


@dataclass(frozen=True)
class StaticTerrainRecord:
    index: int
    offset: int
    x1: int
    x2: int
    y_and_flags: int

    @property
    def surface_y(self) -> int:
        return self.y_and_flags & 0xFF

    @property
    def bounce(self) -> bool:
        return bool(self.y_and_flags & 0x8000)


@dataclass(frozen=True)
class ScriptEdge:
    source: int
    target: Optional[int]
    kind: str
    detail: Optional[str] = None


@dataclass(frozen=True)
class ScriptInstruction:
    pc: int
    opcode: int
    name: str
    size: int
    raw_hex: str
    args: Mapping[str, object]


@dataclass(frozen=True)
class ObjectScriptFlow:
    type_id: int
    type_offset: int
    entry_offset: int
    instructions: Tuple[ScriptInstruction, ...]
    edges: Tuple[ScriptEdge, ...]
    sound_ids: Tuple[int, ...]
    child_type_ids: Tuple[int, ...]
    native_calls: Tuple[Mapping[str, object], ...]
    unresolved_native_transfers: int
    warnings: Tuple[str, ...]


@dataclass(frozen=True)
class LevelRuntimeMetadata:
    level: int
    segment: int
    flat_base: int
    config_raw: bytes
    object_descriptor_offset: int
    bart_descriptor_offset: int
    object_script_table_offset: int
    object_source_list_offset: int
    collision_profiles_offset: int
    static_terrain_offset: int
    palette_a: PaletteBank
    palette_b: PaletteBank
    object_descriptors: Tuple[SpriteDescriptor, ...]
    bart_descriptors: Tuple[SpriteDescriptor, ...]
    object_sources: Tuple[LevelObjectSource, ...]
    object_source_sentinel_offset: int
    object_script_offsets: Tuple[int, ...]
    object_script_padding_words: Tuple[int, ...]
    collision_profiles: Tuple[CollisionProfile, ...]
    static_terrain: Tuple[StaticTerrainRecord, ...]
    static_terrain_sentinel_offset: int
    object_scripts: Tuple[ObjectScriptFlow, ...]
    raw_script_sound_records: Tuple[Mapping[str, object], ...]


@dataclass(frozen=True)
class BackgroundMap:
    columns: int
    rows: int
    tile_ids: Tuple[int, ...]  # column-major: index = column * rows + row

    def tile(self, column: int, row: int) -> int:
        if not (0 <= column < self.columns and 0 <= row < self.rows):
            raise IndexError((column, row))
        return self.tile_ids[column * self.rows + row]

    @property
    def world_width_pixels(self) -> int:
        return self.columns * TILE_WIDTH

    @property
    def world_height_pixels(self) -> int:
        return self.rows * TILE_HEIGHT


class BackgroundTileBank:
    def __init__(self, raw: bytes, used_tile_count: int):
        if len(raw) % TILE_BYTES:
            raise AssetFormatError(f"tile bank size {len(raw):#x} is not a multiple of {TILE_BYTES}")
        self.raw = raw
        self.record_count = len(raw) // TILE_BYTES
        self.used_tile_count = used_tile_count
        if not 0 <= used_tile_count <= self.record_count:
            raise AssetFormatError(
                f"map requires {used_tile_count} tiles, bank contains {self.record_count} records"
            )

    @property
    def padding_records(self) -> int:
        return self.record_count - self.used_tile_count

    def decode_tile(self, tile_id: int) -> IndexedBitmap:
        if not 0 <= tile_id < self.record_count:
            raise IndexError(tile_id)
        src = self.raw[tile_id * TILE_BYTES:(tile_id + 1) * TILE_BYTES]
        pixels = bytearray(TILE_WIDTH * TILE_HEIGHT)
        for y in range(16):
            row = y * 8
            # per row: P0L P0R P1L P1R P2L P2R P3L P3R
            for x in range(16):
                side = 0 if x < 8 else 1
                bit = 7 - (x & 7)
                colour = 0
                for plane in range(4):
                    b = src[row + plane * 2 + side]
                    colour |= ((b >> bit) & 1) << plane
                pixels[y * 16 + x] = colour
        return IndexedBitmap(16, 16, bytes(pixels))


class SpriteSheet:
    """Decoded sprite resource: four colour planes plus a zero reserved block.

    Each LEVELn object/Bart sprite region has five equal-sized chunks.  Direct
    byte checks across LEVEL1..5 show that chunks 0..3 contain the four 1-bpp
    colour planes and chunk 4 is entirely zero in every sheet.  It is therefore
    not a stored transparency mask.  Transparency is colour index 0.
    """

    def __init__(self, raw: bytes, width: int, height: int):
        expected = SPRITE_STORAGE_BLOCKS * (width // 8) * height
        if len(raw) != expected:
            raise AssetFormatError(f"sprite sheet has {len(raw):#x} bytes, expected {expected:#x}")
        self.raw = raw
        self.width = width
        self.height = height
        self.bytes_per_row = width // 8
        self.plane_size = self.bytes_per_row * height
        self._decoded: Optional[IndexedBitmap] = None

        reserved = raw[4 * self.plane_size:5 * self.plane_size]
        if any(reserved):
            raise AssetFormatError(
                "fifth sprite storage chunk is not zero-filled; this image differs from the recovered LEVEL1..5 format"
            )

    def decode(self) -> IndexedBitmap:
        if self._decoded is not None:
            return self._decoded
        pixels = bytearray(self.width * self.height)
        colour_planes = [self.plane_size * i for i in range(4)]
        for y in range(self.height):
            row_byte = y * self.bytes_per_row
            row_pixel = y * self.width
            for xb in range(self.bytes_per_row):
                colours = [self.raw[p + row_byte + xb] for p in colour_planes]
                for bit_index in range(8):
                    bit = 7 - bit_index
                    dst = row_pixel + xb * 8 + bit_index
                    colour = 0
                    for plane, b in enumerate(colours):
                        colour |= ((b >> bit) & 1) << plane
                    pixels[dst] = colour
        # Normal DOS sprite transparency is palette index 0.
        opaque = bytes(1 if colour else 0 for colour in pixels)
        self._decoded = IndexedBitmap(self.width, self.height, bytes(pixels), opaque)
        return self._decoded

    def frame(self, desc: SpriteDescriptor) -> SpriteFrame:
        bitmap = self.decode().crop(
            desc.source_x,
            desc.source_y,
            desc.width_pixels,
            desc.height_pixels,
        )
        return SpriteFrame(desc, bitmap)


@dataclass
class LevelAssets:
    level: int
    source_name: str
    layout: ResourceLayout
    map: BackgroundMap
    tiles: BackgroundTileBank
    object_sheet: SpriteSheet
    bart_sheet: SpriteSheet
    runtime: Optional[LevelRuntimeMetadata] = None

    @property
    def object_frames(self) -> Tuple[SpriteFrame, ...]:
        if self.runtime is None:
            return tuple()
        return tuple(self.object_sheet.frame(d) for d in self.runtime.object_descriptors)

    @property
    def bart_frames(self) -> Tuple[SpriteFrame, ...]:
        if self.runtime is None:
            return tuple()
        return tuple(self.bart_sheet.frame(d) for d in self.runtime.bart_descriptors)


# ---------------------------------------------------------------------------
# Source abstraction: directory, UNPACKED.zip, or one image file
# ---------------------------------------------------------------------------

class _Source:
    def names(self) -> Iterable[str]:
        raise NotImplementedError

    def read(self, name: str) -> bytes:
        raise NotImplementedError

    def find_basename(self, basename: str) -> Optional[str]:
        basename_u = basename.upper()
        matches = [n for n in self.names() if Path(n).name.upper() == basename_u]
        if not matches:
            return None
        return sorted(matches, key=lambda n: (n.count('/'), len(n)))[0]


class _DirectorySource(_Source):
    def __init__(self, root: Path):
        self.root = root
        self._names = [str(p.relative_to(root)).replace(os.sep, '/') for p in root.rglob('*') if p.is_file()]

    def names(self) -> Iterable[str]:
        return self._names

    def read(self, name: str) -> bytes:
        return (self.root / Path(name)).read_bytes()


class _ZipSource(_Source):
    def __init__(self, path: Path):
        self.path = path
        self.zf = zipfile.ZipFile(path, 'r')
        self._names = [n for n in self.zf.namelist() if not n.endswith('/')]

    def names(self) -> Iterable[str]:
        return self._names

    def read(self, name: str) -> bytes:
        return self.zf.read(name)


class _SingleFileSource(_Source):
    def __init__(self, path: Path):
        self.path = path

    def names(self) -> Iterable[str]:
        return [self.path.name]

    def read(self, name: str) -> bytes:
        if Path(name).name != self.path.name:
            raise FileNotFoundError(name)
        return self.path.read_bytes()


# ---------------------------------------------------------------------------
# Parsing/decoding
# ---------------------------------------------------------------------------

def _u16(data: bytes, offset: int) -> int:
    return struct.unpack_from('<H', data, offset)[0]


def _s16(data: bytes, offset: int) -> int:
    return struct.unpack_from('<h', data, offset)[0]


def parse_resource_layout(data: bytes) -> ResourceLayout:
    """Parse the tiny GetResourceLayout routine at 0x001C.

    Expected form shared by LEVEL1..LEVEL5:

        B8 xx xx      mov ax, mapParagraph
        BB xx xx      mov bx, tileParagraph
        B9 xx xx      mov cx, objectSpriteParagraph
        BA xx xx      mov dx, bartSpriteParagraph
        CB            retf
    """
    if data[:2] == b'MZ':
        raise PackedOverlayError(
            "input is an MZ executable (probably PKLITE-packed LEVEL*.OVL); "
            "run the custom PKLITE decoder first and pass LEVEL*.OVL.image.bin"
        )
    if len(data) < 0x29:
        raise AssetFormatError("file is too small to contain the LEVEL overlay interface")
    expected_opcodes = ((0x1C, 0xB8), (0x1F, 0xBB), (0x22, 0xB9), (0x25, 0xBA), (0x28, 0xCB))
    for off, opcode in expected_opcodes:
        if data[off] != opcode:
            raise AssetFormatError(
                f"GetResourceLayout signature mismatch at {off:#x}: "
                f"got {data[off]:02X}, expected {opcode:02X}"
            )
    layout = ResourceLayout(
        ax_map_paragraph=_u16(data, 0x1D),
        bx_tiles_paragraph=_u16(data, 0x20),
        cx_object_sprites_paragraph=_u16(data, 0x23),
        dx_bart_sprites_paragraph=_u16(data, 0x26),
        image_size=len(data),
    )
    starts = [layout.map_start, layout.object_sprites_start, layout.bart_sprites_start, layout.tiles_start, len(data)]
    if starts != sorted(starts):
        raise AssetFormatError(f"resource boundaries are not monotonic: {[hex(x) for x in starts]}")
    if layout.object_sprites_size != OBJECT_SHEET_BYTES:
        raise AssetFormatError(
            f"object sheet size is {layout.object_sprites_size:#x}, expected {OBJECT_SHEET_BYTES:#x}"
        )
    if layout.bart_sprites_size != BART_SHEET_BYTES:
        raise AssetFormatError(
            f"Bart sheet size is {layout.bart_sprites_size:#x}, expected {BART_SHEET_BYTES:#x}"
        )
    if layout.map_size % (MAP_ROWS * 2):
        raise AssetFormatError(
            f"map size {layout.map_size:#x} is not divisible by {MAP_ROWS} rows * 2 bytes"
        )
    if layout.tile_bank_size % TILE_BYTES:
        raise AssetFormatError(f"tile bank size {layout.tile_bank_size:#x} is not 128-byte aligned")
    return layout


def parse_background_map(data: bytes, layout: ResourceLayout) -> BackgroundMap:
    raw = data[layout.map_start:layout.object_sprites_start]
    columns = len(raw) // (MAP_ROWS * 2)
    ids: List[int] = []
    for i in range(0, len(raw), 2):
        # Unlike most DOS words this table stores tile IDs big-endian.
        ids.append((raw[i] << 8) | raw[i + 1])
    return BackgroundMap(columns, MAP_ROWS, tuple(ids))


def _parse_palette_bank(raw64: bytes) -> PaletteBank:
    if len(raw64) != 64:
        raise AssetFormatError("palette bank must be exactly 64 bytes")
    adapter = tuple(raw64[:16])
    rgb = tuple(tuple(raw64[16 + i:16 + i + 3]) for i in range(0, 48, 3))
    if len(rgb) != 16 or any(len(t) != 3 for t in rgb):
        raise AssertionError("internal palette parse error")
    return PaletteBank(adapter, rgb)  # type: ignore[arg-type]


def _parse_descriptor(data: bytes, offset: int, index: int) -> SpriteDescriptor:
    source, width, height, xoff, yoff, unk = struct.unpack_from('<HHHhhH', data, offset)
    return SpriteDescriptor(index, source, width, height, xoff, yoff, unk)


def _is_plausible_bart_descriptor(d: SpriteDescriptor) -> bool:
    # Broad bounds, learned from all five level blocks.  This intentionally allows
    # Level-5 96-pixel-tall frames and Level-2 widthUnits=5 special frames.
    return (
        d.source_offset < BART_SHEET_BYTES
        and 1 <= d.width_units <= 8
        and 1 <= d.height_pixels <= 128
        and -128 <= d.x_offset <= 128
        and -128 <= d.y_offset <= 128
        and d.unknown_0a == 0
        and d.source_x + d.width_pixels <= SPRITE_SHEET_WIDTH
        and d.source_y + d.height_pixels <= BART_SHEET_HEIGHT
    )


def _native_name(level: int, offset: int) -> str:
    if level == 1 and offset in LEVEL1_NATIVE_NAMES:
        return LEVEL1_NATIVE_NAMES[offset]
    return f"Level{level}Native_{offset:04X}"


def _parse_object_sources(exe: bytes, base: int, start: int, end: int) -> Tuple[Tuple[LevelObjectSource, ...], int]:
    out: List[LevelObjectSource] = []
    sentinel = end - LEVEL_OBJECT_SOURCE_SIZE
    index = 0
    for off in range(start, end, LEVEL_OBJECT_SOURCE_SIZE):
        if off + LEVEL_OBJECT_SOURCE_SIZE > end:
            raise AssetFormatError("object source range is not 10-byte aligned")
        stream_x, x, y, type_offset, flags = struct.unpack_from('<HhhHH', exe, base + off)
        if stream_x == 0x7FFF:
            sentinel = off
            break
        if type_offset & 1:
            raise AssetFormatError(f"odd object typeOffset {type_offset:#x} at level offset {off:#x}")
        out.append(LevelObjectSource(index, off, stream_x, x, y, type_offset, flags))
        index += 1
    return tuple(out), sentinel


def _parse_collision_profiles(exe: bytes, base: int, start: int, type_count: int) -> Tuple[CollisionProfile, ...]:
    out: List[CollisionProfile] = []
    for type_id in range(type_count):
        off = start + type_id * COLLISION_PROFILE_SIZE
        handler, xoff, width, yoff, height, param = struct.unpack_from('<HhHhHh', exe, base + off)
        out.append(CollisionProfile(type_id, off, handler, xoff, width, yoff, height, param))
    return tuple(out)


def _parse_static_terrain(exe: bytes, base: int, start: int, level_length: int) -> Tuple[Tuple[StaticTerrainRecord, ...], int]:
    out: List[StaticTerrainRecord] = []
    off = start
    index = 0
    while off + STATIC_TERRAIN_SIZE <= level_length:
        x1, x2, yf = struct.unpack_from('<HHH', exe, base + off)
        if (x1, x2, yf) == (0x7FFF, 0x7FFF, 0x7FFF):
            return tuple(out), off
        out.append(StaticTerrainRecord(index, off, x1, x2, yf))
        index += 1
        off += STATIC_TERRAIN_SIZE
    raise AssetFormatError("static terrain sentinel 7FFF/7FFF/7FFF not found")


def _script_arg_words(exe: bytes, base: int, offset: int, count: int) -> List[int]:
    return [_u16(exe, base + offset + i * 2) for i in range(count)]


def _decode_script_args(
    exe: bytes,
    base: int,
    level: int,
    pc: int,
    opcode: int,
    name: str,
    object_descriptor_count: int,
) -> Dict[str, object]:
    a = base + pc + 2
    args: Dict[str, object] = {}
    if name == "PlaySound":
        args['sound_id'] = _u16(exe, a)
    elif name == "SetAnimation":
        anim_base, frame_count, reload_ticks = struct.unpack_from('<HHH', exe, a)
        args.update(anim_base=anim_base, frame_count=frame_count, reload_ticks=reload_ticks)
        if anim_base % SPRITE_DESCRIPTOR_SIZE == 0:
            first = anim_base // SPRITE_DESCRIPTOR_SIZE
            args['first_descriptor_index'] = first
            args['descriptor_indices'] = list(range(first, min(first + frame_count, object_descriptor_count)))
    elif name == "SetStaticFrame":
        anim_base = _u16(exe, a)
        args['anim_base'] = anim_base
        if anim_base % SPRITE_DESCRIPTOR_SIZE == 0:
            args['descriptor_index'] = anim_base // SPRITE_DESCRIPTOR_SIZE
    elif name in ("Goto", "GotoIfXAtOrRightOfBart"):
        args['target'] = _u16(exe, a)
    elif name in ("SetVelocityX", "SetVelocityY", "SetAccelerationX", "SetAccelerationY"):
        args['fixed_8_8_raw'] = _s16(exe, a)
        args['pixels_per_tick'] = _s16(exe, a) / 256.0
    elif name == "SetTypeAndPersistY":
        type_offset = _u16(exe, a)
        args.update(type_offset=type_offset, type_id=type_offset // 2)
    elif name == "ExternalSpecial3Bytes":
        raw = exe[a:a+3]
        args['bytes'] = list(raw)
        args['hex'] = raw.hex()
    elif name == "SetSourceTypeFlags":
        type_offset, flags = struct.unpack_from('<HH', exe, a)
        args.update(type_offset=type_offset, type_id=type_offset // 2, flags=flags)
    elif name == "WaitUntilYAtLeast":
        args['y_threshold'] = _s16(exe, a)
    elif name == "SetGlobalEventData":
        args['words'] = _script_arg_words(exe, base, pc + 2, 6)
    elif name in ("SpawnChild", "SpawnChildAfterCurrent"):
        runtime_flags, xoff, yoff, type_offset = struct.unpack_from('<HhhH', exe, a)
        args.update(
            runtime_flags=runtime_flags,
            x_offset=xoff,
            y_offset=yoff,
            type_offset=type_offset,
            type_id=type_offset // 2,
        )
    elif name == "SetLevelCameraState":
        mode, target = struct.unpack_from('<hh', exe, a)
        args.update(mode=mode, target=target)
    elif name == "TriggerGlobalEventSound4":
        args['sound_id'] = 4
    elif name in ("SetGlobalRange", "SetGlobalTargets"):
        v0, v1 = struct.unpack_from('<hh', exe, a)
        args.update(value0=v0, value1=v1)
    elif name == "CallNativeFar":
        target_offset, target_segment = struct.unpack_from('<HH', exe, a)
        args.update(
            target_offset=target_offset,
            target_segment=target_segment,
            target=f"{target_segment:04X}:{target_offset:04X}",
            name=(
                _native_name(level, target_offset)
                if target_segment == LEVEL_DATA_SEGMENTS[level]
                else (f"RootNative_{target_offset:04X}" if target_segment == 0 else None)
            ),
        )
    return args


def _decode_object_script_flow(
    exe: bytes,
    level: int,
    base: int,
    level_length: int,
    type_id: int,
    entry: int,
    object_descriptor_count: int,
) -> ObjectScriptFlow:
    from collections import deque

    queue = deque([entry])
    visited: set[int] = set()
    instructions: Dict[int, ScriptInstruction] = {}
    edges: List[ScriptEdge] = []
    warnings: List[str] = []
    sound_ids: set[int] = set()
    child_type_ids: set[int] = set()
    native_calls: List[Mapping[str, object]] = []
    unresolved_native = 0

    def enqueue(target: Optional[int]) -> None:
        if target is not None and 0 <= target < level_length and target not in visited:
            queue.append(target)

    def add_edge(source: int, target: Optional[int], kind: str, detail: Optional[str] = None) -> None:
        edges.append(ScriptEdge(source, target, kind, detail))
        enqueue(target)

    while queue:
        pc = queue.popleft()
        if pc in visited:
            continue
        if len(visited) > 4096:
            warnings.append("instruction limit reached; flow may be cyclic/corrupt")
            break
        visited.add(pc)
        if pc < 0 or pc + 2 > level_length:
            warnings.append(f"PC {pc:04X} is outside level block")
            continue

        opcode = _u16(exe, base + pc)
        if opcode == 0:
            if pc + 4 > level_length:
                warnings.append(f"truncated Wait at {pc:04X}")
                continue
            ticks = _u16(exe, base + pc + 2)
            raw = exe[base + pc:base + pc + 4]
            instructions[pc] = ScriptInstruction(pc, 0, "Wait", 4, raw.hex(), {'ticks': ticks})
            add_edge(pc, pc + 4, "resume_after_wait")
            continue

        spec = SCRIPT_HANDLER_SPECS.get(opcode)
        if spec is None:
            raw = exe[base + pc:base + min(pc + 8, level_length)]
            instructions[pc] = ScriptInstruction(pc, opcode, "UnknownHandlerWord", 2, raw.hex(), {})
            warnings.append(f"unknown handler word {opcode:04X} at {pc:04X}")
            continue

        name, arg_bytes = spec
        size = 2 + arg_bytes
        if pc + size > level_length:
            warnings.append(f"truncated {name} at {pc:04X}")
            continue
        args = _decode_script_args(exe, base, level, pc, opcode, name, object_descriptor_count)
        raw = exe[base + pc:base + pc + size]
        instructions[pc] = ScriptInstruction(pc, opcode, name, size, raw.hex(), args)
        next_pc = pc + size

        if 'sound_id' in args:
            sound_ids.add(int(args['sound_id']))
        if name in ("SpawnChild", "SpawnChildAfterCurrent") and 'type_id' in args:
            child_type_ids.add(int(args['type_id']))

        if name == "Goto":
            add_edge(pc, int(args['target']), "goto")
        elif name == "GotoIfXAtOrRightOfBart":
            add_edge(pc, int(args['target']), "object_x_at_or_right_of_bart")
            add_edge(pc, next_pc, "object_x_left_of_bart")
        elif name == "Despawn":
            edges.append(ScriptEdge(pc, None, "despawn_terminal"))
        elif name == "WaitUntilYAtLeast":
            add_edge(pc, next_pc, "condition_met")
            edges.append(ScriptEdge(pc, pc, "retry_until_condition"))
        elif name == "SpawnChild":
            add_edge(pc, next_pc, "spawn_succeeded")
            edges.append(ScriptEdge(pc, pc, "retry_if_no_free_runtime_slot"))
        elif name == "CallNativeFar":
            target_offset = int(args['target_offset'])
            target_segment = int(args['target_segment'])
            call_info: Dict[str, object] = dict(args)
            effects: Tuple[Tuple[str, Optional[int]], ...]
            if target_segment == LEVEL_DATA_SEGMENTS[level]:
                effects = NATIVE_FLOW_EFFECTS.get((level, target_offset), (("rel",0),))
                call_info['flow_effects'] = [list(x) for x in effects]
            elif (target_segment, target_offset) in EXTERNAL_NATIVE_FLOW_EFFECTS:
                effects = EXTERNAL_NATIVE_FLOW_EFFECTS[(target_segment, target_offset)]
                call_info['flow_effects'] = [list(x) for x in effects]
                call_info['note'] = 'root/core FAR callback with recovered SI effect'
            else:
                effects = (("unknown",None),)
                call_info['flow_effects'] = [["unknown", None]]
                call_info['note'] = 'native target is outside this level segment and has unknown SI behavior'
            native_calls.append(call_info)
            for kind, value in effects:
                if kind == "rel" and value is not None:
                    target = next_pc + value
                    edge_kind = "native_fallthrough" if value == 0 else "native_relative_redirect"
                    add_edge(pc, target, edge_kind, f"SI += {value}")
                elif kind == "abs" and value is not None:
                    add_edge(pc, value, "native_absolute_redirect")
                else:
                    unresolved_native += 1
                    edges.append(ScriptEdge(pc, None, "unresolved_native_transfer", str(args.get('target'))))
        else:
            add_edge(pc, next_pc, "next")

    ordered = tuple(instructions[k] for k in sorted(instructions))
    dedup_edges: List[ScriptEdge] = []
    edge_keys = set()
    for e in edges:
        key = (e.source, e.target, e.kind, e.detail)
        if key not in edge_keys:
            edge_keys.add(key)
            dedup_edges.append(e)
    return ObjectScriptFlow(
        type_id=type_id,
        type_offset=type_id * 2,
        entry_offset=entry,
        instructions=ordered,
        edges=tuple(dedup_edges),
        sound_ids=tuple(sorted(sound_ids)),
        child_type_ids=tuple(sorted(child_type_ids)),
        native_calls=tuple(native_calls),
        unresolved_native_transfers=unresolved_native,
        warnings=tuple(warnings),
    )


def _flow_to_json(flow: ObjectScriptFlow) -> Dict[str, object]:
    return {
        'type_id': flow.type_id,
        'type_offset': flow.type_offset,
        'entry_offset': flow.entry_offset,
        'entry_hex': f"{flow.entry_offset:04X}",
        'instructions': [
            {
                'pc': i.pc,
                'pc_hex': f"{i.pc:04X}",
                'opcode': i.opcode,
                'opcode_hex': f"{i.opcode:04X}",
                'name': i.name,
                'size': i.size,
                'raw_hex': i.raw_hex,
                'args': dict(i.args),
            }
            for i in flow.instructions
        ],
        'edges': [
            {
                'from': e.source,
                'from_hex': f"{e.source:04X}",
                'to': e.target,
                'to_hex': f"{e.target:04X}" if e.target is not None else None,
                'kind': e.kind,
                'detail': e.detail,
            }
            for e in flow.edges
        ],
        'sound_ids': list(flow.sound_ids),
        'child_type_ids': list(flow.child_type_ids),
        'native_calls': [dict(x) for x in flow.native_calls],
        'unresolved_native_transfers': flow.unresolved_native_transfers,
        'warnings': list(flow.warnings),
    }


def _scan_raw_script_sound_records(exe: bytes, level: int, base: int, level_length: int) -> Tuple[Mapping[str, object], ...]:
    """Catalog every byte-level `5B99 <soundId>` marker in the mutable level block.

    This is deliberately separate from CFG reachability.  Level-specific native
    code can install script PCs dynamically, so a valid script fragment may not
    be reachable from the ordinary object-type root table by static analysis.
    V11 independently confirmed the 33 records found by this scan.
    """
    out: List[Mapping[str, object]] = []
    for off in range(0, level_length - 3):
        if exe[base + off:base + off + 2] != b'\x99\x5b':
            continue
        sound_id = _u16(exe, base + off + 2)
        if sound_id > 0x12:
            continue
        out.append({
            'offset': off,
            'offset_hex': f'{off:04X}',
            'flat_address': base + off,
            'sound_id': sound_id,
            'sound_id_hex': f'{sound_id:02X}',
        })
    return tuple(out)


def _object_type_to_json(runtime: LevelRuntimeMetadata, flow: ObjectScriptFlow) -> Dict[str, object]:
    data = _flow_to_json(flow)
    sources = [src for src in runtime.object_sources if src.type_id == flow.type_id]
    data['source_records'] = [asdict(src) | {'type_id': src.type_id} for src in sources]
    if flow.type_id < len(runtime.collision_profiles):
        cp = runtime.collision_profiles[flow.type_id]
        data['collision_profile'] = asdict(cp) | {'collision_index': cp.collision_index}
    descriptor_indices: set[int] = set()
    for instr in flow.instructions:
        if 'descriptor_index' in instr.args:
            idx = int(instr.args['descriptor_index'])
            if 0 <= idx < len(runtime.object_descriptors):
                descriptor_indices.add(idx)
        for idx in instr.args.get('descriptor_indices', []):  # type: ignore[union-attr]
            idx = int(idx)
            if 0 <= idx < len(runtime.object_descriptors):
                descriptor_indices.add(idx)
    data['referenced_object_descriptor_indices'] = sorted(descriptor_indices)
    return data


def parse_runtime_metadata(exe: bytes, level: int) -> LevelRuntimeMetadata:
    segment = LEVEL_DATA_SEGMENTS[level]
    base = segment << 4
    level_length = LEVEL_DATA_LENGTHS[level]
    if base + level_length > len(exe):
        raise AssetFormatError(
            f"SIMPSONS.EXE image is too small for Level {level} block "
            f"{segment:04X}:0000 + {level_length:04X}"
        )
    cfg = exe[base:base + LEVEL_RUNTIME_CONFIG_SIZE]
    if len(cfg) != LEVEL_RUNTIME_CONFIG_SIZE:
        raise AssetFormatError("truncated LevelRuntimeConfig")

    object_desc_off = _u16(cfg, 0x00)
    level_segment = _u16(cfg, 0x02)
    bart_desc_off = _u16(cfg, 0x3C)
    object_sources = _u16(cfg, 0x40)
    scripts = _u16(cfg, 0x44)
    collisions = _u16(cfg, 0x48)
    terrain = _u16(cfg, 0x50)

    if level_segment != segment:
        raise AssetFormatError(
            f"Level {level} config says segment {level_segment:04X}, expected {segment:04X}"
        )
    if bart_desc_off < object_desc_off or (bart_desc_off - object_desc_off) % SPRITE_DESCRIPTOR_SIZE:
        raise AssetFormatError("object descriptor range is not 12-byte aligned")

    sources, source_sentinel = _parse_object_sources(exe, base, object_sources, object_desc_off)
    if not sources:
        raise AssetFormatError(f"Level {level} has no object source records")
    type_count = max(src.type_id for src in sources) + 1

    # The script pointer area has five trailing zero words in all five levels.
    script_capacity_words = (object_sources - scripts) // 2
    if script_capacity_words < type_count:
        raise AssetFormatError("object script pointer table is shorter than object type count")
    script_offsets = tuple(_u16(exe, base + scripts + i * 2) for i in range(type_count))
    padding_words = tuple(
        _u16(exe, base + scripts + i * 2)
        for i in range(type_count, script_capacity_words)
    )

    object_count = (bart_desc_off - object_desc_off) // SPRITE_DESCRIPTOR_SIZE
    object_descs = tuple(
        _parse_descriptor(exe, base + object_desc_off + i * SPRITE_DESCRIPTOR_SIZE, i)
        for i in range(object_count)
    )

    # Bart table length is not stored explicitly. Scan descriptor-shaped records
    # and stop at the first record that cannot address the 320x288 Bart sheet.
    bart_descs: List[SpriteDescriptor] = []
    off = bart_desc_off
    index = 0
    hard_stop = min(level_length, collisions if collisions > bart_desc_off else bart_desc_off + 0x1000)
    while off + SPRITE_DESCRIPTOR_SIZE <= hard_stop:
        desc = _parse_descriptor(exe, base + off, index)
        if not _is_plausible_bart_descriptor(desc):
            break
        bart_descs.append(desc)
        index += 1
        off += SPRITE_DESCRIPTOR_SIZE

    palette_a = _parse_palette_bank(exe[base + 0x78:base + 0xB8])
    palette_b = _parse_palette_bank(exe[base + 0xB8:base + 0xF8])
    collision_profiles = _parse_collision_profiles(exe, base, collisions, type_count)
    terrain_records, terrain_sentinel = _parse_static_terrain(exe, base, terrain, level_length)
    object_scripts = tuple(
        _decode_object_script_flow(
            exe, level, base, level_length, type_id, entry, len(object_descs)
        )
        for type_id, entry in enumerate(script_offsets)
    )
    raw_script_sound_records = _scan_raw_script_sound_records(exe, level, base, level_length)

    return LevelRuntimeMetadata(
        level=level,
        segment=segment,
        flat_base=base,
        config_raw=cfg,
        object_descriptor_offset=object_desc_off,
        bart_descriptor_offset=bart_desc_off,
        object_script_table_offset=scripts,
        object_source_list_offset=object_sources,
        collision_profiles_offset=collisions,
        static_terrain_offset=terrain,
        palette_a=palette_a,
        palette_b=palette_b,
        object_descriptors=object_descs,
        bart_descriptors=tuple(bart_descs),
        object_sources=sources,
        object_source_sentinel_offset=source_sentinel,
        object_script_offsets=script_offsets,
        object_script_padding_words=padding_words,
        collision_profiles=collision_profiles,
        static_terrain=terrain_records,
        static_terrain_sentinel_offset=terrain_sentinel,
        object_scripts=object_scripts,
        raw_script_sound_records=raw_script_sound_records,
    )

def load_level(level: int, data: bytes, source_name: str, exe: Optional[bytes] = None) -> LevelAssets:
    layout = parse_resource_layout(data)
    bgmap = parse_background_map(data, layout)
    max_tile = max(bgmap.tile_ids) if bgmap.tile_ids else -1
    used_tiles = max_tile + 1
    tiles = BackgroundTileBank(data[layout.tiles_start:], used_tiles)

    # In every recovered level the map uses each tile ID densely from 0..max.
    unique = set(bgmap.tile_ids)
    expected_ids = set(range(used_tiles))
    if unique != expected_ids:
        missing = sorted(expected_ids - unique)[:20]
        raise AssetFormatError(
            f"Level {level} tile IDs are not dense 0..{max_tile}; first missing IDs: {missing}"
        )

    obj = SpriteSheet(
        data[layout.object_sprites_start:layout.bart_sprites_start],
        SPRITE_SHEET_WIDTH,
        OBJECT_SHEET_HEIGHT,
    )
    bart = SpriteSheet(
        data[layout.bart_sprites_start:layout.tiles_start],
        SPRITE_SHEET_WIDTH,
        BART_SHEET_HEIGHT,
    )
    runtime = parse_runtime_metadata(exe, level) if exe is not None else None
    return LevelAssets(level, source_name, layout, bgmap, tiles, obj, bart, runtime)


class SimpsonsAssets:
    """Collection of the five level resource banks and optional EXE metadata."""

    def __init__(self, levels: Mapping[int, LevelAssets], exe_present: bool, source: str):
        self.levels = dict(levels)
        self.exe_present = exe_present
        self.source = source

    @classmethod
    def open(cls, source: Union[str, os.PathLike[str]], exe: Optional[Union[str, os.PathLike[str]]] = None) -> "SimpsonsAssets":
        path = Path(source)
        if path.is_dir():
            src: _Source = _DirectorySource(path)
        elif path.is_file() and zipfile.is_zipfile(path):
            src = _ZipSource(path)
        elif path.is_file():
            src = _SingleFileSource(path)
        else:
            raise FileNotFoundError(path)

        exe_data: Optional[bytes] = None
        if exe is not None:
            exe_data = Path(exe).read_bytes()
        else:
            exe_name = src.find_basename('SIMPSONS.EXE.image.bin')
            if exe_name:
                exe_data = src.read(exe_name)

        levels: Dict[int, LevelAssets] = {}
        for level in range(1, 6):
            basename = f'LEVEL{level}.OVL.image.bin'
            name = src.find_basename(basename)
            if name is None:
                # If user supplied a single LEVELn image, only load that one.
                continue
            data = src.read(name)
            levels[level] = load_level(level, data, name, exe_data)

        # Helpful error when somebody passes an original packed file directly.
        if not levels and path.is_file() and path.suffix.upper() == '.OVL':
            raw = path.read_bytes()
            if raw[:2] == b'MZ':
                raise PackedOverlayError(
                    "This is a packed MZ LEVEL*.OVL.  First run the custom PKLITE decoder and "
                    "pass the resulting LEVEL*.OVL.image.bin (or UNPACKED.zip)."
                )

        if not levels:
            names = ', '.join(sorted(Path(n).name for n in src.names())[:20])
            raise AssetFormatError(
                "no LEVEL1..LEVEL5.OVL.image.bin files found. "
                f"Visible files include: {names}"
            )
        return cls(levels, exe_data is not None, str(path))


# ---------------------------------------------------------------------------
# Pillow export helpers
# ---------------------------------------------------------------------------

def _require_pillow():
    try:
        from PIL import Image  # type: ignore
        return Image
    except ImportError as exc:
        raise SystemExit("--export requires Pillow: pip install pillow") from exc


def _palette_for(level: LevelAssets, bank: str = 'A') -> Tuple[Tuple[int, int, int], ...]:
    if level.runtime is None:
        # Useful fallback only for debugging when EXE image is not supplied.
        return (
            (0, 0, 0), (0, 0, 170), (0, 170, 0), (0, 170, 170),
            (170, 0, 0), (170, 0, 170), (170, 85, 0), (170, 170, 170),
            (85, 85, 85), (85, 85, 255), (85, 255, 85), (85, 255, 255),
            (255, 85, 85), (255, 85, 255), (255, 255, 85), (255, 255, 255),
        )
    return level.runtime.palette_a.rgb8 if bank.upper() == 'A' else level.runtime.palette_b.rgb8


def _bitmap_to_rgba(bitmap: IndexedBitmap, palette: Sequence[Tuple[int, int, int]]):
    Image = _require_pillow()
    rgba = bytearray(bitmap.width * bitmap.height * 4)
    mask = bitmap.opaque_mask
    for i, idx in enumerate(bitmap.pixels):
        r, g, b = palette[idx & 0x0F]
        a = 255 if mask is None or mask[i] else 0
        pos = i * 4
        rgba[pos:pos + 4] = bytes((r, g, b, a))
    return Image.frombytes('RGBA', (bitmap.width, bitmap.height), bytes(rgba))


def render_background(level: LevelAssets, palette_bank: str = 'A'):
    Image = _require_pillow()
    palette = _palette_for(level, palette_bank)
    width = level.map.world_width_pixels
    height = level.map.world_height_pixels
    image = Image.new('RGB', (width, height))
    tile_cache = [_bitmap_to_rgba(level.tiles.decode_tile(i), palette).convert('RGB') for i in range(level.tiles.used_tile_count)]
    for col in range(level.map.columns):
        for row in range(level.map.rows):
            tile_id = level.map.tile(col, row)
            image.paste(tile_cache[tile_id], (col * 16, row * 16))
    return image


def render_tile_atlas(level: LevelAssets, palette_bank: str = 'A', columns: int = 32):
    Image = _require_pillow()
    palette = _palette_for(level, palette_bank)
    count = level.tiles.used_tile_count
    rows = (count + columns - 1) // columns
    image = Image.new('RGB', (columns * 16, rows * 16))
    for i in range(count):
        tile = _bitmap_to_rgba(level.tiles.decode_tile(i), palette).convert('RGB')
        image.paste(tile, ((i % columns) * 16, (i // columns) * 16))
    return image


def render_palette(level: LevelAssets, palette_bank: str = 'A', cell: int = 32):
    Image = _require_pillow()
    palette = _palette_for(level, palette_bank)
    image = Image.new('RGB', (8 * cell, 2 * cell))
    for i, colour in enumerate(palette):
        swatch = Image.new('RGB', (cell, cell), colour)
        image.paste(swatch, ((i % 8) * cell, (i // 8) * cell))
    return image


def export_assets(collection: SimpsonsAssets, destination: Union[str, os.PathLike[str]]) -> None:
    dest = Path(destination)
    dest.mkdir(parents=True, exist_ok=True)
    collection_manifest = {
        'source': collection.source,
        'exe_metadata_present': collection.exe_present,
        'levels': {},
    }

    for level_no, level in sorted(collection.levels.items()):
        level_dir = dest / f'level{level_no}'
        level_dir.mkdir(exist_ok=True)
        palette = _palette_for(level, 'A')

        # Full decoded resource views.
        render_background(level).save(level_dir / 'background_map.png')
        render_tile_atlas(level).save(level_dir / 'background_tiles.png')
        _bitmap_to_rgba(level.object_sheet.decode(), palette).save(level_dir / 'object_sheet.png')
        _bitmap_to_rgba(level.bart_sheet.decode(), palette).save(level_dir / 'bart_sheet.png')
        render_palette(level, 'A').save(level_dir / 'palette_A.png')
        if level.runtime is not None:
            render_palette(level, 'B').save(level_dir / 'palette_B.png')

        # Individual decoded tile images.  These are small and make downstream
        # tooling/debugging much easier than slicing an atlas again.
        tile_dir = level_dir / 'tiles'
        tile_dir.mkdir(exist_ok=True)
        for tile_id in range(level.tiles.used_tile_count):
            _bitmap_to_rgba(level.tiles.decode_tile(tile_id), palette).convert('RGB').save(
                tile_dir / f'tile_{tile_id:03d}.png'
            )

        # Descriptor-addressed frames, if the EXE metadata is available.
        if level.runtime is not None:
            object_dir = level_dir / 'object_frames'
            bart_dir = level_dir / 'bart_frames'
            object_dir.mkdir(exist_ok=True)
            bart_dir.mkdir(exist_ok=True)
            for frame in level.object_frames:
                d = frame.descriptor
                _bitmap_to_rgba(frame.bitmap, palette).save(object_dir / f'object_{d.index:03d}.png')
            for frame in level.bart_frames:
                d = frame.descriptor
                _bitmap_to_rgba(frame.bitmap, palette).save(bart_dir / f'bart_{d.index:03d}.png')

        runtime_summary = None
        if level.runtime is not None:
            r = level.runtime
            runtime_summary = {
                'segment': f'{r.segment:04X}',
                'flat_base': r.flat_base,
                'object_descriptor_offset': r.object_descriptor_offset,
                'object_descriptor_count': len(r.object_descriptors),
                'bart_descriptor_offset': r.bart_descriptor_offset,
                'bart_descriptor_count': len(r.bart_descriptors),
                'object_script_table_offset': r.object_script_table_offset,
                'object_script_count': len(r.object_script_offsets),
                'object_script_padding_words': list(r.object_script_padding_words),
                'object_source_list_offset': r.object_source_list_offset,
                'object_source_count': len(r.object_sources),
                'object_source_sentinel_offset': r.object_source_sentinel_offset,
                'collision_profiles_offset': r.collision_profiles_offset,
                'collision_profile_count': len(r.collision_profiles),
                'static_terrain_offset': r.static_terrain_offset,
                'static_terrain_count': len(r.static_terrain),
                'static_terrain_sentinel_offset': r.static_terrain_sentinel_offset,
                'palette_A': {
                    'adapter_map': list(r.palette_a.adapter_map),
                    'rgb6': [list(c) for c in r.palette_a.rgb6],
                    'rgb8_dac': [list(c) for c in r.palette_a.rgb8],
                    'rgb8_logical': [list(c) for c in r.palette_a.logical_rgb8],
                },
                'palette_B': {
                    'adapter_map': list(r.palette_b.adapter_map),
                    'rgb6': [list(c) for c in r.palette_b.rgb6],
                    'rgb8_dac': [list(c) for c in r.palette_b.rgb8],
                    'rgb8_logical': [list(c) for c in r.palette_b.logical_rgb8],
                },
                'object_descriptors': [asdict(d) | {'width_pixels': d.width_pixels, 'source_x': d.source_x, 'source_y': d.source_y} for d in r.object_descriptors],
                'bart_descriptors': [asdict(d) | {'width_pixels': d.width_pixels, 'source_x': d.source_x, 'source_y': d.source_y} for d in r.bart_descriptors],
                'object_sources': [asdict(src) | {'type_id': src.type_id} for src in r.object_sources],
                'collision_profiles': [asdict(cp) | {'collision_index': cp.collision_index} for cp in r.collision_profiles],
                'static_terrain': [asdict(t) | {'surface_y': t.surface_y, 'bounce': t.bounce} for t in r.static_terrain],
                'raw_play_sound_record_count': len(r.raw_script_sound_records),
                'object_script_summary': [
                    {
                        'type_id': flow.type_id,
                        'entry_offset': flow.entry_offset,
                        'instruction_count': len(flow.instructions),
                        'edge_count': len(flow.edges),
                        'sound_ids': list(flow.sound_ids),
                        'child_type_ids': list(flow.child_type_ids),
                        'native_call_count': len(flow.native_calls),
                        'unresolved_native_transfers': flow.unresolved_native_transfers,
                        'warnings': list(flow.warnings),
                    }
                    for flow in r.object_scripts
                ],
            }

        level_manifest = {
            'source_name': level.source_name,
            'layout': {
                'AX_map_paragraph': level.layout.ax_map_paragraph,
                'BX_tiles_paragraph': level.layout.bx_tiles_paragraph,
                'CX_object_sprites_paragraph': level.layout.cx_object_sprites_paragraph,
                'DX_bart_sprites_paragraph': level.layout.dx_bart_sprites_paragraph,
                'map_start': level.layout.map_start,
                'object_sprites_start': level.layout.object_sprites_start,
                'bart_sprites_start': level.layout.bart_sprites_start,
                'tiles_start': level.layout.tiles_start,
                'image_size': level.layout.image_size,
            },
            'map': {
                'columns': level.map.columns,
                'rows': level.map.rows,
                'world_width_pixels': level.map.world_width_pixels,
                'world_height_pixels': level.map.world_height_pixels,
                'max_tile_id': level.tiles.used_tile_count - 1,
                'unique_tile_ids': len(set(level.map.tile_ids)),
            },
            'tiles': {
                'used_tile_count': level.tiles.used_tile_count,
                'record_count': level.tiles.record_count,
                'padding_records': level.tiles.padding_records,
            },
            'object_sheet': {'width': level.object_sheet.width, 'height': level.object_sheet.height},
            'bart_sheet': {'width': level.bart_sheet.width, 'height': level.bart_sheet.height},
            'runtime': runtime_summary,
        }
        if level.runtime is not None:
            r = level.runtime
            script_document = {
                'level': level_no,
                'segment': f'{r.segment:04X}',
                'vm': {
                    'dispatch': 'direct-threaded',
                    'wait_opcode': '0000',
                    'handler_addresses': {f'{op:04X}': name for op, (name, _n) in SCRIPT_HANDLER_SPECS.items()},
                    'native_note': 'CallNativeFar may alter DS:SI; CFG uses recovered per-native SI effects and marks unresolved dynamic transfers explicitly.',
                },
                'object_types': [_object_type_to_json(r, flow) for flow in r.object_scripts],
                'raw_play_sound_records': list(r.raw_script_sound_records),
                'raw_play_sound_note': 'Byte-level catalog; includes dynamically selected fragments not necessarily reachable from object type roots.',
            }
            (level_dir / 'object_scripts.json').write_text(json.dumps(script_document, indent=2), encoding='utf-8')
            runtime_document = {
                'level': level_no,
                'segment': f'{r.segment:04X}',
                'object_sources': [asdict(src) | {'type_id': src.type_id} for src in r.object_sources],
                'collision_profiles': [asdict(cp) | {'collision_index': cp.collision_index} for cp in r.collision_profiles],
                'static_terrain': [asdict(t) | {'surface_y': t.surface_y, 'bounce': t.bounce} for t in r.static_terrain],
            }
            (level_dir / 'runtime_data.json').write_text(json.dumps(runtime_document, indent=2), encoding='utf-8')

        (level_dir / 'manifest.json').write_text(json.dumps(level_manifest, indent=2), encoding='utf-8')
        collection_manifest['levels'][str(level_no)] = level_manifest

    (dest / 'manifest.json').write_text(json.dumps(collection_manifest, indent=2), encoding='utf-8')


def export_json_metadata(collection: SimpsonsAssets, destination: Union[str, os.PathLike[str]]) -> None:
    """Export manifests/runtime/script CFGs without requiring Pillow."""
    dest = Path(destination)
    dest.mkdir(parents=True, exist_ok=True)
    collection_manifest: Dict[str, object] = {
        'source': collection.source,
        'exe_metadata_present': collection.exe_present,
        'levels': {},
    }
    for level_no, level in sorted(collection.levels.items()):
        level_dir = dest / f'level{level_no}'
        level_dir.mkdir(exist_ok=True)
        base_summary: Dict[str, object] = {
            'source_name': level.source_name,
            'layout': asdict(level.layout),
            'map': {
                'columns': level.map.columns,
                'rows': level.map.rows,
                'world_width_pixels': level.map.world_width_pixels,
                'world_height_pixels': level.map.world_height_pixels,
                'max_tile_id': level.tiles.used_tile_count - 1,
                'unique_tile_ids': len(set(level.map.tile_ids)),
            },
            'tiles': {
                'used_tile_count': level.tiles.used_tile_count,
                'record_count': level.tiles.record_count,
                'padding_records': level.tiles.padding_records,
            },
        }
        if level.runtime is not None:
            r = level.runtime
            scripts = {
                'level': level_no,
                'segment': f'{r.segment:04X}',
                'vm': {
                    'dispatch': 'direct-threaded',
                    'wait_opcode': '0000',
                    'handler_addresses': {f'{op:04X}': name for op, (name, _n) in SCRIPT_HANDLER_SPECS.items()},
                    'native_note': 'Guaranteed CFG edges only; unresolved native SI transfers are explicit null-target edges.',
                },
                'object_types': [_object_type_to_json(r, flow) for flow in r.object_scripts],
                'raw_play_sound_records': list(r.raw_script_sound_records),
                'raw_play_sound_note': 'Byte-level catalog; includes dynamically selected fragments not necessarily reachable from object type roots.',
            }
            (level_dir / 'object_scripts.json').write_text(json.dumps(scripts, indent=2), encoding='utf-8')
            runtime_data = {
                'level': level_no,
                'segment': f'{r.segment:04X}',
                'object_script_offsets': list(r.object_script_offsets),
                'object_script_padding_words': list(r.object_script_padding_words),
                'object_sources': [asdict(src) | {'type_id': src.type_id} for src in r.object_sources],
                'collision_profiles': [asdict(cp) | {'collision_index': cp.collision_index} for cp in r.collision_profiles],
                'static_terrain': [asdict(t) | {'surface_y': t.surface_y, 'bounce': t.bounce} for t in r.static_terrain],
            }
            (level_dir / 'runtime_data.json').write_text(json.dumps(runtime_data, indent=2), encoding='utf-8')
            base_summary['runtime'] = {
                'segment': f'{r.segment:04X}',
                'object_type_count': len(r.object_scripts),
                'object_source_count': len(r.object_sources),
                'collision_profile_count': len(r.collision_profiles),
                'static_terrain_count': len(r.static_terrain),
                'object_descriptor_count': len(r.object_descriptors),
                'bart_descriptor_count': len(r.bart_descriptors),
                'unresolved_native_transfer_count': sum(f.unresolved_native_transfers for f in r.object_scripts),
                'raw_play_sound_record_count': len(r.raw_script_sound_records),
            }
        (level_dir / 'manifest.json').write_text(json.dumps(base_summary, indent=2), encoding='utf-8')
        collection_manifest['levels'][str(level_no)] = base_summary  # type: ignore[index]
    (dest / 'manifest.json').write_text(json.dumps(collection_manifest, indent=2), encoding='utf-8')


def print_summary(collection: SimpsonsAssets) -> None:
    print(f"Source: {collection.source}")
    print(f"SIMPSONS.EXE metadata: {'yes' if collection.exe_present else 'no'}")
    print()
    print("Lvl  map start  columns  object sheet       Bart sheet         tiles      padding  descriptors")
    print("---  ---------  -------  -----------------  -----------------  ---------  -------  -----------")
    for n, level in sorted(collection.levels.items()):
        desc = '-'
        if level.runtime is not None:
            r = level.runtime
            unresolved = sum(f.unresolved_native_transfers for f in r.object_scripts)
            desc = f"obj={len(r.object_descriptors)}, bart={len(r.bart_descriptors)}, scripts={len(r.object_scripts)}, native?={unresolved}"
        print(
            f"{n:>3}  {level.layout.map_start:08X}  {level.map.columns:>7}  "
            f"{level.object_sheet.width}x{level.object_sheet.height:<10}  "
            f"{level.bart_sheet.width}x{level.bart_sheet.height:<10}  "
            f"{level.tiles.used_tile_count:>4}/{level.tiles.record_count:<4}  "
            f"{level.tiles.padding_records:>7}  {desc}"
        )


def _build_arg_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        description='Load/decode The Simpsons DOS LEVEL*.OVL flat asset images.',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split('Examples\n--------\n', 1)[1].split('Python API\n----------\n', 1)[0].strip(),
    )
    p.add_argument('source', help='UNPACKED.zip, directory, or LEVELn.OVL.image.bin')
    p.add_argument('--exe', help='optional SIMPSONS.EXE.image.bin; auto-detected in directory/zip')
    p.add_argument('--export', metavar='DIR', help='export decoded PNGs plus JSON manifests/script CFGs')
    p.add_argument('--json-only', metavar='DIR', help='export JSON manifests/runtime/script CFGs without Pillow')
    return p


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = _build_arg_parser().parse_args(argv)
    try:
        collection = SimpsonsAssets.open(args.source, args.exe)
        print_summary(collection)
        if args.export:
            export_assets(collection, args.export)
            print(f"\nExported decoded assets + script CFG JSON to: {Path(args.export).resolve()}")
        if args.json_only:
            export_json_metadata(collection, args.json_only)
            print(f"\nExported JSON metadata + script CFGs to: {Path(args.json_only).resolve()}")
        return 0
    except (AssetFormatError, FileNotFoundError, OSError, zipfile.BadZipFile) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
