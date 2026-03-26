/* eslint-disable no-console */
import { promises as fs } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";

console.log("Installing all dependencies for fixtures...");

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const fixturesDir = join(__dirname, "fixtures");
const entries = await fs.readdir(fixturesDir, { withFileTypes: true });

// Get all directories
const directories = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => join(fixturesDir, entry.name));

for (const dir of directories) {
  try {
    const pkgString = await fs.readFile(join(dir, "package.json"), { encoding: "utf-8" });
    const packageJson = JSON.parse(pkgString);
    // If there are no dependencies, skip installation
    if (!packageJson.dependencies) {
      continue;
    }
  } catch {
    continue;
  }

  execSync("pnpm install", {
    cwd: dir,
    stdio: "inherit",
  });
}

console.log("All fixture dependencies installed successfully!");
