import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(toolsDir, "..");
const tscPath = join(projectRoot, "node_modules", "typescript", "bin", "tsc");

if (!existsSync(tscPath)) {
  console.error("TypeScript is not installed locally. Run 'npm install' first.");
  process.exit(1);
}

// Start the static development server in this process.
await import("./server.mjs");

// Do not spawn npm.cmd here. On Windows with recent Node versions, spawning
// batch/cmd wrappers with shell:false can fail with EINVAL. Execute the local
// TypeScript compiler JS file directly with the current Node executable.
const compiler = spawn(
  process.execPath,
  [tscPath, "-p", join(projectRoot, "tsconfig.json"), "--watch", "--preserveWatchOutput"],
  {
    cwd: projectRoot,
    stdio: "inherit",
    shell: false,
  },
);

compiler.on("error", (error) => {
  console.error("Failed to start the TypeScript watcher:", error);
});

compiler.on("exit", (code) => {
  if (code && code !== 0) {
    console.error(`TypeScript watcher exited with code ${code}.`);
  }
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!compiler.killed) {
      compiler.kill();
    }
    process.exit(0);
  });
}
