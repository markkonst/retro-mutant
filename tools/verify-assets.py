#!/usr/bin/env python3
"""Compare regenerated assets with a reference: JSON values and decoded PNG pixels."""
import argparse
import json
from pathlib import Path
from PIL import Image

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('reference')
parser.add_argument('generated')
args = parser.parse_args()
reference, generated = Path(args.reference), Path(args.generated)
def files(root):
    return {p.relative_to(root) for p in root.rglob('*') if p.is_file()}
expected, actual = files(reference), files(generated)
errors = []
for relative in sorted(expected - actual):
    errors.append(f'Missing: {relative}')
for relative in sorted(actual - expected):
    errors.append(f'Extra: {relative}')
byte_equal = 0
for relative in sorted(expected & actual):
    a, b = reference / relative, generated / relative
    if a.read_bytes() == b.read_bytes():
        byte_equal += 1
        continue
    if a.suffix == '.png':
        with Image.open(a) as x, Image.open(b) as y:
            equal = x.size == y.size and x.convert('RGBA').tobytes() == y.convert('RGBA').tobytes()
    elif a.suffix == '.json':
        equal = json.loads(a.read_text(encoding='utf-8')) == json.loads(b.read_text(encoding='utf-8'))
    else:
        equal = False
    if not equal:
        errors.append(f'Content differs: {relative}')
print(f'Compared {len(expected & actual)} files; {byte_equal} byte-identical.')
if errors:
    print('\n'.join(errors))
    raise SystemExit(1)
print('Same file set, JSON values, PNG pixels and binary assets. PNG compression/JSON whitespace may differ.')
