import { ManifestJson } from "./types.js";

/** DOS selects the next 64-byte palette bank while DS:07DE is nonzero.
 * PNG assets already contain bank-A RGB colours, so recover their palette
 * entries by colour and replace them with bank B. This is not an orange tint:
 * each of the sixteen colours has its own original VGA DAC replacement.
 */
export function createXrayPalette(runtime: ManifestJson["runtime"]): Map<number, number[]> {
  const replacements = new Map<number, number[]>();
  const normal = runtime.palette_A?.rgb6;
  const alternate = runtime.palette_B?.rgb6;
  if (!normal || !alternate) return replacements;
  const rgb8 = (rgb: number[]) => rgb.map(value => Math.round(value * 255 / 63));
  normal.forEach((rgb, index) => {
    if (!alternate[index]) return;
    const [r, g, b] = rgb8(rgb);
    replacements.set((r! << 16) | (g! << 8) | b!, rgb8(alternate[index]!));
  });
  return replacements;
}

/** Preserve alpha and debug colours that do not belong to the DOS palette. */
export function applyXrayPalette(pixels: Uint8ClampedArray, replacements: Map<number, number[]>): void {
  for (let i = 0; i < pixels.length; i += 4) {
    const colour = replacements.get((pixels[i]! << 16) | (pixels[i + 1]! << 8) | pixels[i + 2]!);
    if (!colour) continue;
    pixels[i] = colour[0]!;
    pixels[i + 1] = colour[1]!;
    pixels[i + 2] = colour[2]!;
  }
}
