#!/usr/bin/env python3
"""Export the viewer's runtime subset from locally unpacked DOS files.

Requires Python 3.10+ and Pillow. No game bytes are included in this script.
Offsets describe the supported DOS release; other versions may differ.
"""
import argparse
import json
import shutil
import tempfile
from pathlib import Path
from simpsons_ovl_assets import SimpsonsAssets, export_assets, LEVEL_DATA_SEGMENTS, _decode_object_script_flow, _flow_to_json


def write_json(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def reserved_action_scripts(exe):
    """Include both paths: ignition skips the dormant Despawn instruction.
    Ordinary object-type CFG discovery cannot reach these reserved-slot scripts.
    """
    scripts = {}
    for name, entry, launch in [('rocket_right', 0x2FFA, 0x300A), ('rocket_left', 0x3032, 0x3042)]:
        paths = [_flow_to_json(_decode_object_script_flow(exe, 1, 0x96D0, 0x32B0, 2, pc, 256)) for pc in (entry, launch)]
        data = paths[0]
        instructions = {i['pc']: i for path in paths for i in path['instructions']}
        data['instructions'] = sorted(instructions.values(), key=lambda i: i['pc'])
        data['edges'] = [e for path in paths for e in path['edges']]
        scripts[name] = data
    for name, entry in [('bomb_right', 0x2F9C), ('bomb_left', 0x2FD2)]:
        scripts[name] = _flow_to_json(_decode_object_script_flow(exe, 1, 0x96D0, 0x32B0, 1, entry, 256))
    return scripts


def export(source, destination):
    source, destination = Path(source).resolve(), Path(destination).resolve()
    exe = (source / 'SIMPSONS.EXE.image.bin').read_bytes()
    vga = (source / 'VGA.OVL.image.bin').read_bytes()
    font = vga[0x4609:0x4609 + 2048]
    if len(font) != 2048:
        raise ValueError('VGA load image is too short for the 8x8 font')
    collection = SimpsonsAssets.open(str(source))
    if set(collection.levels) != set(range(1, 6)) or not collection.exe_present:
        raise ValueError('All five LEVEL images and SIMPSONS.EXE image are required')
    # Stage all decoding before writing the requested destination.
    with tempfile.TemporaryDirectory() as temporary:
        decoded = Path(temporary)
        export_assets(collection, decoded)
        for n in range(1, 6):
            level = decoded / f'level{n}'
            segment = LEVEL_DATA_SEGMENTS[n]
            base = segment << 4
            def word(offset):
                return int.from_bytes(exe[base + offset:base + offset + 2], 'little')
            player = {
                'level': n, 'source': 'SIMPSONS.EXE LevelRuntimeConfig',
                'level_segment': f'{segment:04X}',
                'camera_max_x': word(0x06), 'bart_max_x': word(0x08),
                'ground_y_default': word(0x0A), 'start_x': word(0x0C),
                'variant': word(0x0E), 'initial_max_speed_x_fixed_8_8': 512,
                'initial_animation_reload': 3, 'initial_goals_bcd': word(0x0E),
                'boss_hit_points': word(0x28),
                # 2F4Bh initializes the letter sequence; 6817h collects tokens.
                'helper_token_count': int.from_bytes(exe[0x80F0 + 0x6A3 + n * 16 + 2:0x80F0 + 0x6A3 + n * 16 + 4], 'little'),
                'helper_source_offset': word(0x70),
                'boss_respawn_hit_points': word(0x2A),
                'boss_hitbox': [word(o) for o in (0x2C, 0x2E, 0x30, 0x32)],
                'progress_source_offset': word(0x58),
                'inventory_item8_source_offset': word(0x64),
                'inventory_item6_source_offset': word(0x68),
            }
            if n == 1:
                player['goal_gate_source_offset'] = word(0x54)
                player['reserved_action_scripts'] = reserved_action_scripts(exe)
            write_json(level / 'player_runtime.json', player)
            messages = []
            # Recovered message banks, including native-selected prank calls.
            start, count = {1: (0x170B, 19), 5: (0x1A20, 5)}.get(n, (0, 0))
            offset = start
            for _ in range(count):
                end = exe.index(b'\0', base + offset)
                raw = exe[base + offset:end]
                lines, line, i = [], '', 0
                while i < len(raw):
                    byte = raw[i]
                    if byte == 1:
                        lines.append(line)
                        line = ''
                        i += 2  # newline plus vertical-position argument
                    elif byte == 2:
                        i += 2  # horizontal-position argument
                    else:
                        line += chr(byte)
                        i += 1
                lines.append(line)
                messages.append({'segment': segment, 'offset': offset,
                                 'segment_hex': f'{segment:04X}', 'offset_hex': f'{offset:04X}',
                                 'lines': lines, 'raw_hex': raw.hex()})
                offset = end - base + 1
            write_json(level / 'event_messages.json', {'level': n, 'messages': messages})
            manifest = json.loads((level / 'manifest.json').read_text())
            manifest['source_name'] = f'UNPACKED/LEVEL{n}.OVL.image.bin'
            write_json(level / 'manifest.json', manifest)
        destination.mkdir(parents=True, exist_ok=True)
        for n in range(1, 6):
            target = destination / f'level{n}'
            if target.exists():
                raise FileExistsError(f'{target} already exists; use a fresh output directory')
        for n in range(1, 6):
            level = decoded / f'level{n}'
            target = destination / f'level{n}'
            target.mkdir()
            for name in ['background_map.png', 'manifest.json', 'runtime_data.json',
                         'object_scripts.json', 'player_runtime.json', 'event_messages.json']:
                shutil.copy2(level / name, target / name)
            for name in ['object_frames', 'bart_frames']:
                shutil.copytree(level / name, target / name)
        (destination / 'dos_font_8x8.bin').write_bytes(font)
    print(f'Exported five levels and VGA font to {destination}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', help='directory containing unpacked .image.bin files')
    parser.add_argument('--export', required=True, help='fresh output directory')
    args = parser.parse_args()
    export(args.source, args.export)
