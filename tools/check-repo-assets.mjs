import { execFileSync } from "node:child_process";

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" }).split("\0").filter(Boolean);
const forbidden = tracked.filter((path) =>
  /^(GAME|UNPACKED)\//i.test(path) ||
  /(^|\/)(data|decoded_assets|decoded_json)\//i.test(path) ||
  /\.(png|jpe?g|gif|webp|bmp|wav|mp3|ogg|ovl|bin|zip|adf|lha)$/i.test(path) ||
  /(^|\/)simpsons\.exe$/i.test(path),
);
if (forbidden.length) {
  console.error("Game assets must remain local and untracked:\n" + forbidden.join("\n"));
  process.exit(1);
}
console.log("No asset files in the Git index.");
