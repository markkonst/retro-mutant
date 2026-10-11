import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceArg = process.argv[2];
if (!sourceArg) {
  console.error("Usage: npm run import-assets -- <decoded_assets_directory>");
  process.exit(2);
}

const sourceRoot = resolve(sourceArg);
const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const destinationRoot = join(projectRoot, "wwwroot", "data");

const requiredFiles = ["background_map.png", "manifest.json", "runtime_data.json", "object_scripts.json", "player_runtime.json", "event_messages.json"];

if (!existsSync(join(sourceRoot, "dos_font_8x8.bin"))) {
  throw new Error("Missing dos_font_8x8.bin; use tools/export-viewer-assets.py (see README.md)");
}

for (let level = 1; level <= 5; level++) {
  const source = join(sourceRoot, `level${level}`);
  if (!existsSync(source)) {
    throw new Error(`Missing ${source}`);
  }
  for (const filename of requiredFiles) {
    if (!existsSync(join(source, filename))) {
      throw new Error(`Missing ${join(source, filename)}`);
    }
  }
  if (!existsSync(join(source, "object_frames"))) {
    throw new Error(`Missing ${join(source, "object_frames")}`);
  }
  if (!existsSync(join(source, "bart_frames"))) {
    throw new Error(`Missing ${join(source, "bart_frames")}`);
  }

}

// Validate all five levels before replacing any existing local assets.
mkdirSync(destinationRoot, { recursive: true });
cpSync(join(sourceRoot, "dos_font_8x8.bin"), join(destinationRoot, "dos_font_8x8.bin"));
for (let level = 1; level <= 5; level++) {
  const source = join(sourceRoot, `level${level}`);
  const destination = join(destinationRoot, `level${level}`);
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(destination, { recursive: true });

  for (const filename of requiredFiles) {
    cpSync(join(source, filename), join(destination, basename(filename)));
  }
  cpSync(join(source, "object_frames"), join(destination, "object_frames"), { recursive: true });
  cpSync(join(source, "bart_frames"), join(destination, "bart_frames"), { recursive: true });
  console.log(`Imported level ${level}`);
}
