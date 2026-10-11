#!/usr/bin/env python3
r"""
unpack_simpsons.py

Extract the DECOMPRESSED 16-bit DOS load image from PKLITE-packed
Bart vs. the Space Mutants files.

Defaults:
    input : /game/simpsons
    output: /unpacked

On Windows, when run from drive C:, those mean:
    C:\game\simpsons
    C:\unpacked

The output is deliberately a FLAT load image for Ghidra, not a rebuilt
runnable MZ .EXE. Example:
    SIMPSONS.EXE.image.bin
    LEVEL1.OVL.image.bin

No third-party Python packages are required.

This is a focused PKLITE image extractor, not a universal PKLITE unpacker.
It implements the LZ/Huffman stream used by the versions relevant to this
game, including the "large" and "extra" flags used by PKLITE 1.12.

Algorithm information was independently implemented from publicly documented
PKLITE format behavior.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import struct
import sys
from dataclasses import dataclass
from pathlib import Path


# ---------------------------------------------------------------------------
# PKLITE prefix codes
#
# Bits are consumed LSB-first from each 16-bit little-endian bit word.
# ---------------------------------------------------------------------------

COUNT_LARGE = {
    "10": 2,
    "11": 3,
    "000": 4,
    "0010": 5,
    "0011": 6,
    "0100": 7,
    "01010": 8,
    "01011": 9,
    "01100": 10,
    "011010": 11,
    "011011": 12,
    "011100": -1,       # special: an extra byte follows
    "0111010": 13,
    "0111011": 14,
    "0111100": 15,
    "01111010": 16,
    "01111011": 17,
    "01111100": 18,
    "011111010": 19,
    "011111011": 20,
    "011111100": 21,
    "011111101": 22,
    "011111110": 23,
    "011111111": 24,
}

COUNT_SMALL = {
    "00": 3,
    "010": 2,
    "011": -1,          # special: an extra byte follows
    "100": 4,
    "101": 5,
    "1100": 6,
    "1101": 7,
    "1110": 8,
    "1111": 9,
}

OFFSET_CODE = {
    "1": 0,
    "0000": 1,
    "0001": 2,
    "00100": 3,
    "00101": 4,
    "00110": 5,
    "00111": 6,
    "010000": 7,
    "010001": 8,
    "010010": 9,
    "010011": 10,
    "010100": 11,
    "010101": 12,
    "010110": 13,
    "0101110": 14,
    "0101111": 15,
    "0110000": 16,
    "0110001": 17,
    "0110010": 18,
    "0110011": 19,
    "0110100": 20,
    "0110101": 21,
    "0110110": 22,
    "0110111": 23,
    "0111000": 24,
    "0111001": 25,
    "0111010": 26,
    "0111011": 27,
    "0111100": 28,
    "0111101": 29,
    "0111110": 30,
    "0111111": 31,
}


# Known PKLITE decompressor-stub lengths.
# Key = (raw major/version byte << 8) | minor byte.
# 0x310C is PKLITE 1.12 with LARGE + EXTRA, used by this game.
STUB_LENGTHS = {
    0x0100: 0x1D0,
    0x0103: 0x1D0,
    0x0105: 0x1D0,
    0x010C: 0x1D0,
    0x010D: 0x1D0,
    0x010E: 0x1D0,
    0x010F: 0x1D0,

    0x1103: 0x1E0,
    0x110C: 0x1E0,
    0x110D: 0x1E0,
    0x110E: 0x200,
    0x110F: 0x200,

    0x2100: 0x290,
    0x2103: 0x290,
    0x2105: 0x290,
    0x210A: 0x290,
    0x210C: 0x290,
    0x210D: 0x290,
    0x210E: 0x290,
    0x210F: 0x290,

    0x3103: 0x2A0,
    0x310C: 0x290,
    0x310D: 0x290,
    0x310E: 0x2C0,
    0x310F: 0x2C0,
}


class PKLiteError(Exception):
    pass


@dataclass
class PKLiteInfo:
    version: str
    version_code: int
    large: bool
    extra: bool
    mz_header_size: int
    stub_length: int
    compressed_data_offset: int


class ByteReader:
    def __init__(self, data: bytes, pos: int = 0):
        self.data = data
        self.pos = pos

    def remaining(self) -> int:
        return len(self.data) - self.pos

    def u8(self) -> int:
        if self.pos >= len(self.data):
            raise PKLiteError("Onverwacht einde van bestand.")
        v = self.data[self.pos]
        self.pos += 1
        return v

    def u16le(self) -> int:
        if self.pos + 2 > len(self.data):
            raise PKLiteError("Onverwacht einde van bestand.")
        v = self.data[self.pos] | (self.data[self.pos + 1] << 8)
        self.pos += 2
        return v


class InterleavedBitReader:
    """
    PKLITE stores 16-bit flag words in the same stream as literal/offset bytes.
    Each flag word is little-endian, and its bits are consumed bit 0..15.
    """

    def __init__(self, reader: ByteReader):
        self.reader = reader
        self.word = self.reader.u16le()
        self.bit_index = 0

    def bit(self) -> int:
        b = (self.word >> self.bit_index) & 1
        self.bit_index += 1

        # PKLITE refills immediately after bit 15 was consumed.
        # This detail also affects EXTRA-mode literal decryption.
        if self.bit_index == 16:
            self.word = self.reader.u16le()
            self.bit_index = 0

        return b


def read_prefix(bits: InterleavedBitReader, table: dict[str, int]) -> int:
    max_len = max(map(len, table))
    code = ""
    for _ in range(max_len):
        code += "1" if bits.bit() else "0"
        if code in table:
            return table[code]
    raise PKLiteError(f"Ongeldige Huffman/prefixcode: {code!r}")


def parse_pklite_info(data: bytes) -> PKLiteInfo:
    if len(data) < 0x40:
        raise PKLiteError("Bestand is te klein voor een DOS MZ/PKLITE-bestand.")

    if data[:2] not in (b"MZ", b"ZM"):
        raise PKLiteError("Geen DOS MZ executable.")

    # The normal PKLITE copyright signature is here in the files we target.
    if data[0x1E:0x24] != b"PKLITE":
        raise PKLiteError("Geen herkenbare PKLITE-signature op offset 0x1E.")

    minor = data[0x1C]
    major_raw = data[0x1D]

    major = major_raw & 0x0F
    version = f"{major}.{minor:02d}"
    large = bool(major_raw & 0x20)
    extra = bool(major_raw & 0x10)
    version_code = (major_raw << 8) | minor

    header_paragraphs = struct.unpack_from("<H", data, 0x08)[0]
    mz_header_size = header_paragraphs << 4

    stub_length = STUB_LENGTHS.get(version_code)

    # A few historical versions encode the length in the stub itself.
    if stub_length is None and version_code in (0x0132, 0x0201, 0x2132, 0x2201):
        p = mz_header_size + 0x48
        if p + 2 > len(data):
            raise PKLiteError("Kan dynamische decompressorlengte niet lezen.")
        v = struct.unpack_from("<H", data, p)[0]
        stub_length = ((v << 1) + 0x62) & ~0x0F

    if stub_length is None:
        raise PKLiteError(
            f"PKLITE {version} / code 0x{version_code:04X} wordt door "
            "dit gerichte script nog niet ondersteund."
        )

    compressed_data_offset = mz_header_size + stub_length
    if compressed_data_offset >= len(data):
        raise PKLiteError(
            f"Berekende compressed-data offset 0x{compressed_data_offset:X} "
            f"valt buiten bestand ({len(data)} bytes)."
        )

    return PKLiteInfo(
        version=version,
        version_code=version_code,
        large=large,
        extra=extra,
        mz_header_size=mz_header_size,
        stub_length=stub_length,
        compressed_data_offset=compressed_data_offset,
    )


def decompress_load_image(data: bytes) -> tuple[bytes, PKLiteInfo, int]:
    info = parse_pklite_info(data)

    r = ByteReader(data, info.compressed_data_offset)
    bits = InterleavedBitReader(r)
    count_table = COUNT_LARGE if info.large else COUNT_SMALL
    out = bytearray()

    while True:
        duplication = bits.bit()

        if not duplication:
            # Literal byte.
            b = r.u8()

            if info.extra:
                # EXTRA mode lightly encrypts literal bytes.  The key depends
                # on the current bit position AFTER consuming the selector bit.
                b ^= (16 - bits.bit_index) & 0xFF

            out.append(b)
            continue

        count = read_prefix(bits, count_table)

        if count == -1:
            special = r.u8()

            if special == 0xFF:
                # End of compressed load image.
                break

            if special == 0xFE:
                if info.large:
                    # No output; continue with next token.
                    continue
                raise PKLiteError(
                    "PKLITE small-mode uncompressed-region marker 0xFE "
                    "wordt niet ondersteund."
                )

            if special == 0xFD and info.large:
                raise PKLiteError(
                    "PKLITE large-mode uncompressed-region marker 0xFD "
                    "wordt niet ondersteund."
                )

            count = special + (25 if info.large else 10)

        # For a 2-byte match, PKLITE omits the high offset code.
        offset_hi = 0
        if count != 2:
            offset_hi = read_prefix(bits, OFFSET_CODE) << 8

        distance = offset_hi | r.u8()
        src0 = len(out) - distance

        # Copy byte-by-byte because LZ matches may overlap.
        for i in range(count):
            src = src0 + i

            # PKLITE can conceptually refer to zero-initialised memory before
            # the beginning of the decompressed image.
            if src < 0 or src >= len(out):
                b = 0
            else:
                b = out[src]

            out.append(b)

    return bytes(out), info, r.pos


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def is_candidate(path: Path) -> bool:
    n = path.name.upper()
    return n == "SIMPSONS.EXE" or n.endswith(".OVL")


def describe_flags(info: PKLiteInfo) -> str:
    return (
        f"{'large' if info.large else 'small'}, "
        f"{'extra' if info.extra else 'normal'}"
    )


def unpack_directory(src: Path, dst: Path, force: bool = False) -> int:
    if not src.is_dir():
        print(f"FOUT: inputmap bestaat niet: {src}", file=sys.stderr)
        return 2

    dst.mkdir(parents=True, exist_ok=True)

    files = sorted(
        (p for p in src.iterdir() if p.is_file() and is_candidate(p)),
        key=lambda p: p.name.upper()
    )

    if not files:
        print(f"Geen SIMPSONS.EXE of *.OVL gevonden in {src}")
        return 1

    manifest = {
        "source_directory": str(src),
        "output_directory": str(dst),
        "files": [],
    }

    ok = 0
    skipped = 0
    failed = 0

    print(f"Input : {src}")
    print(f"Output: {dst}")
    print()

    for path in files:
        raw = path.read_bytes()

        item = {
            "input": path.name,
            "input_size": len(raw),
            "input_sha256": sha256(raw),
        }

        try:
            info = parse_pklite_info(raw)
        except PKLiteError as e:
            # This is expected for ADLIB.OVL / ROLAND.OVL / BUZZER.OVL
            # and any other raw/non-PKLITE modules.
            print(f"[SKIP] {path.name:<16} {e}")
            item["status"] = "skipped"
            item["reason"] = str(e)
            manifest["files"].append(item)
            skipped += 1
            continue

        out_name = path.name + ".image.bin"
        out_path = dst / out_name

        if out_path.exists() and not force:
            print(
                f"[SKIP] {path.name:<16} output bestaat al: {out_path.name} "
                "(gebruik --force om te overschrijven)"
            )
            item["status"] = "skipped-existing"
            item["output"] = out_name
            manifest["files"].append(item)
            skipped += 1
            continue

        try:
            image, info, stream_end = decompress_load_image(raw)
            out_path.write_bytes(image)

            print(
                f"[ OK ] {path.name:<16} "
                f"PKLITE {info.version} ({describe_flags(info)})  "
                f"{len(raw):>7} -> {len(image):>7} bytes  "
                f"=> {out_name}"
            )

            item.update({
                "status": "ok",
                "output": out_name,
                "output_size": len(image),
                "output_sha256": sha256(image),
                "pklite_version": info.version,
                "pklite_version_code": f"0x{info.version_code:04X}",
                "large": info.large,
                "extra": info.extra,
                "mz_header_size": info.mz_header_size,
                "stub_length": info.stub_length,
                "compressed_data_offset": info.compressed_data_offset,
                "compressed_stream_end": stream_end,
            })
            ok += 1

        except Exception as e:
            print(f"[FAIL] {path.name:<16} {e}", file=sys.stderr)
            item["status"] = "failed"
            item["reason"] = str(e)
            failed += 1

        manifest["files"].append(item)

    manifest_path = dst / "unpack_manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2),
        encoding="utf-8"
    )

    print()
    print(f"Klaar: {ok} uitgepakt, {skipped} overgeslagen, {failed} mislukt.")
    print(f"Manifest: {manifest_path}")

    if ok:
        print()
        print("Voor Ghidra:")
        print("  Format   : Raw Binary")
        print("  Language : x86:LE:16:Real Mode")
        print("  Base     : 0000")

    return 0 if failed == 0 else 3


def main() -> int:
    ap = argparse.ArgumentParser(
        description=(
            "Pak de PKLITE load images van Bart vs. the Space Mutants uit "
            "naar flat .image.bin-bestanden voor Ghidra."
        )
    )
    ap.add_argument(
        "--input",
        default="/game/simpsons",
        help="Map met originele gamebestanden (default: /game/simpsons)",
    )
    ap.add_argument(
        "--output",
        default="/unpacked",
        help="Outputmap (default: /unpacked)",
    )
    ap.add_argument(
        "--force",
        action="store_true",
        help="Bestaande .image.bin-bestanden overschrijven.",
    )
    args = ap.parse_args()

    return unpack_directory(
        Path(args.input),
        Path(args.output),
        force=args.force,
    )


if __name__ == "__main__":
    raise SystemExit(main())
