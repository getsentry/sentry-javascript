import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { globFiles } from "../../src/core/glob";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

let tmpDir: string;

beforeEach(async () => {
  tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "glob-test-"));
});

afterEach(async () => {
  await fs.promises.rm(tmpDir, { recursive: true, force: true });
});

/** Helper: create a file (and any parent dirs) under tmpDir. */
async function touch(...segments: string[]): Promise<string> {
  const filePath = path.join(tmpDir, ...segments);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, "");
  return filePath;
}

describe("globFiles", () => {
  describe("core behavior", () => {
    it("returns absolute paths", async () => {
      await touch("a.js");
      const result = await globFiles(path.join(tmpDir, "**/*.js"));
      expect(result).toHaveLength(1);
      expect(path.isAbsolute(result[0]!)).toBe(true);
    });

    it("excludes directories (nodir)", async () => {
      // Create a directory that matches the glob pattern
      await fs.promises.mkdir(path.join(tmpDir, "subdir.js"), { recursive: true });
      await touch("real.js");
      const result = await globFiles(path.join(tmpDir, "**/*.js"));
      expect(result).toEqual([path.join(tmpDir, "real.js")]);
    });

    it("returns [] for no matches", async () => {
      await touch("a.txt");
      const result = await globFiles(path.join(tmpDir, "**/*.js"));
      expect(result).toEqual([]);
    });

    it("returns [] for nonexistent pattern path", async () => {
      const result = await globFiles(path.join(tmpDir, "nonexistent/**/*.js"));
      expect(result).toEqual([]);
    });

    it("matches deeply nested files", async () => {
      const filePath = await touch("a", "b", "c", "deep.js");
      const result = await globFiles(path.join(tmpDir, "**/*.js"));
      expect(result).toEqual([filePath]);
    });

    it("works with a string pattern", async () => {
      await touch("single.js");
      const result = await globFiles(path.join(tmpDir, "*.js"));
      expect(result).toHaveLength(1);
    });

    it("works with an array of patterns", async () => {
      const jsFile = await touch("a.js");
      const mapFile = await touch("a.js.map");
      await touch("b.css");

      const result = await globFiles([
        path.join(tmpDir, "**/*.js"),
        path.join(tmpDir, "**/*.js.map"),
      ]);
      result.sort();
      expect(result).toEqual([jsFile, mapFile].sort());
    });
  });

  describe("root option", () => {
    it("scopes results to root directory", async () => {
      await touch("file.js");
      // Patterns starting with / are resolved relative to root
      const result = await globFiles("/**/*.js", { root: tmpDir });
      expect(result).toEqual([path.join(tmpDir, "file.js")]);
    });
  });

  describe("ignore option", () => {
    it("excludes files matching ignore string pattern", async () => {
      await touch("keep.js");
      await touch("node_modules", "dep.js");

      const result = await globFiles(path.join(tmpDir, "**/*.js"), {
        ignore: path.join(tmpDir, "node_modules/**"),
      });
      expect(result).toEqual([path.join(tmpDir, "keep.js")]);
    });

    it("excludes files matching ignore array patterns", async () => {
      await touch("keep.js");
      await touch("node_modules", "dep.js");
      await touch("dist", "bundle.js");

      const result = await globFiles(path.join(tmpDir, "**/*.js"), {
        ignore: [path.join(tmpDir, "node_modules/**"), path.join(tmpDir, "dist/**")],
      });
      expect(result).toEqual([path.join(tmpDir, "keep.js")]);
    });
  });

  describe("rollup JS/map patterns", () => {
    const JS_AND_MAP_PATTERNS = [
      "/**/*.js",
      "/**/*.mjs",
      "/**/*.cjs",
      "/**/*.js.map",
      "/**/*.mjs.map",
      "/**/*.cjs.map",
    ].map((q) => `${q}?(\\?*)?(#*)`);

    it("matches .js, .mjs, .cjs and their .map variants", async () => {
      const files = await Promise.all([
        touch("a.js"),
        touch("b.mjs"),
        touch("c.cjs"),
        touch("a.js.map"),
        touch("b.mjs.map"),
        touch("c.cjs.map"),
      ]);

      const result = await globFiles(JS_AND_MAP_PATTERNS, { root: tmpDir });
      result.sort();
      expect(result).toEqual(files.sort());
    });

    it("does NOT match .css, .ts, .json, etc.", async () => {
      await touch("style.css");
      await touch("types.ts");
      await touch("data.json");
      await touch("readme.md");

      const result = await globFiles(JS_AND_MAP_PATTERNS, { root: tmpDir });
      expect(result).toEqual([]);
    });

    it("works in nested subdirectories", async () => {
      const files = await Promise.all([
        touch("src", "deep", "a.js"),
        touch("src", "deep", "a.js.map"),
      ]);

      const result = await globFiles(JS_AND_MAP_PATTERNS, { root: tmpDir });
      result.sort();
      expect(result).toEqual(files.sort());
    });

    it("returns [] for empty directory", async () => {
      const result = await globFiles(JS_AND_MAP_PATTERNS, { root: tmpDir });
      expect(result).toEqual([]);
    });
  });
});
