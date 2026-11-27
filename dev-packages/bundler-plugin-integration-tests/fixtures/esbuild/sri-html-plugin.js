import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

// esbuild has no SRI support. Users add a plugin like this one that
// hashes the written entry points in `onEnd` and writes the HTML.
export function sriHtmlPlugin() {
  return {
    name: "sri-html",
    setup(build) {
      build.initialOptions.metafile = true;
      build.onEnd((result) => {
        const cwd = build.initialOptions.absWorkingDir ?? process.cwd();
        const scripts = Object.entries(result.metafile.outputs)
          .filter(([, output]) => output.entryPoint)
          .map(([file]) => {
            const integrity = `sha384-${createHash("sha384")
              .update(readFileSync(join(cwd, file)))
              .digest("base64")}`;
            return `<script type="module" src="${basename(file)}" integrity="${integrity}" crossorigin="anonymous"></script>`;
          });
        const outdir = join(cwd, build.initialOptions.outdir ?? dirname(build.initialOptions.outfile));
        writeFileSync(join(outdir, "index.html"), `<!doctype html><html><head>${scripts.join("")}</head></html>`);
      });
    },
  };
}
