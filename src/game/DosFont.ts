let font = new Uint8Array(2048);

export async function loadDosFont(): Promise<void> {
  const response = await fetch('/data/dos_font_8x8.bin');
  if (!response.ok) throw new Error('Missing DOS font. Generate and import the local assets as described in README.md.');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length !== 2048) throw new Error('Invalid DOS font: expected 2048 bytes.');
  font = bytes;
}

export function glyphRows(charCode: number): Uint8Array {
  const start = (charCode & 0xff) * 8;
  return font.subarray(start, start + 8);
}
