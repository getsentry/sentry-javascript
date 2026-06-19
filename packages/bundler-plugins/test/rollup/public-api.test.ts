import { sentryRollupPlugin } from "../../src/rollup";
import type { Plugin, SourceMap } from "rollup";
import { describe, it, expect, test, beforeEach, vi } from "vitest";

test("Rollup plugin should exist", () => {
  expect(sentryRollupPlugin).toBeDefined();
  expect(typeof sentryRollupPlugin).toBe("function");
});

describe("sentryRollupPlugin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns an array of rollup plugins (although only one)", () => {
    const plugins = sentryRollupPlugin({
      authToken: "test-token",
      org: "test-org",
      project: "test-project",
    }) as Plugin[];

    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins).toHaveLength(1);

    expect(plugins[0]?.name).toBe("sentry-rollup-plugin");
  });
});

describe("Hooks", () => {
  const [plugin] = sentryRollupPlugin({ release: { inject: false } }) as [Plugin];

  const renderChunk = plugin.renderChunk as (
    code: string,
    chunkInfo: { fileName: string; facadeModuleId?: string }
  ) => {
    code: string;
    map: SourceMap;
  } | null;

  describe("renderChunk", () => {
    it("should inject debug ID into clean JavaScript files", () => {
      const code = 'console.log("Hello world");';
      const result = renderChunk(code, { fileName: "bundle.js" });

      expect(result).not.toBeNull();
      expect(result?.code).toMatchInlineSnapshot(
        `"!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="d4309f93-5358-4ae1-bcf0-3813aa590eb5",e._sentryDebugIdIdentifier="sentry-dbid-d4309f93-5358-4ae1-bcf0-3813aa590eb5");}catch(e){}}();console.log("Hello world");"`
      );
    });

    it("should inject debug ID after 'use strict'", () => {
      const code = '"use strict";\nconsole.log("Hello world");';
      const result = renderChunk(code, { fileName: "bundle.js" });

      expect(result).not.toBeNull();
      expect(result?.code).toMatchInlineSnapshot(`
        ""use strict";!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="79a86c07-8ecc-4367-82b0-88cf822f2d41",e._sentryDebugIdIdentifier="sentry-dbid-79a86c07-8ecc-4367-82b0-88cf822f2d41");}catch(e){}}();
        console.log("Hello world");"
      `);
    });

    it.each([
      ["bundle.js"],
      ["bundle.mjs"],
      ["bundle.cjs"],
      ["bundle.js?foo=bar"],
      ["bundle.js#hash"],
    ])("should process file '%s'", (fileName) => {
      const code = 'console.log("test");';
      const result = renderChunk(code, { fileName });

      expect(result).not.toBeNull();
      expect(result?.code).toMatchSnapshot();
    });

    it.each([["index.html"], ["styles.css"]])("should NOT process file '%s': %s", (fileName) => {
      const code = 'console.log("test");';
      const result = renderChunk(code, { fileName });

      expect(result).toBeNull();
    });

    it.each([
      [
        "inline format at start",
        ';{try{(function(){var e="undefined"!=typeof window?window:e._sentryDebugIdIdentifier="sentry-dbid-existing-id");})();}catch(e){}};console.log("test");',
      ],
      [
        "comment format at end",
        'console.log("test");\n//# debugId=f6ccd6f4-7ea0-4854-8384-1c9f8340af81\n//# sourceMappingURL=bundle.js.map',
      ],
      [
        "inline format with large file",
        `"use strict";\n${"// comment\n".repeat(10)};{try{(function(){var e="undefined"!=typeof window?window:e._sentryDebugIdIdentifier="sentry-dbid-existing-id");})();}catch(e){}};${`\nconsole.log("line");\n`.repeat(100)}`,
      ],
    ])("should NOT inject when debug ID already exists (%s)", (_description, code) => {
      const result = renderChunk(code, { fileName: "bundle.js" });
      expect(result).toBeNull();
    });

    it("should only check boundaries for performance (not entire file)", () => {
      // Inline format beyond first 6KB boundary
      const codeWithInlineBeyond6KB = `${"a".repeat(6100)};{try{(function(){var e="undefined"!=typeof window?window:e._sentryDebugIdIdentifier="sentry-dbid-existing-id");})();}catch(e){}};`;

      expect(renderChunk(codeWithInlineBeyond6KB, { fileName: "bundle.js" })).not.toBeNull();

      // Comment format beyond last 500 bytes boundary
      const codeWithCommentBeyond500B = `//# debugId=f6ccd6f4-7ea0-4854-8384-1c9f8340af81\n${"a".repeat(600)}`;

      expect(renderChunk(codeWithCommentBeyond500B, { fileName: "bundle.js" })).not.toBeNull();
    });

    describe("HTML facade chunks (MPA vs SPA)", () => {
      // Issue #829: MPA facades should be skipped
      // Regression fix: SPA main bundles with HTML facades should NOT be skipped

      it.each([
        ["empty", ""],
        ["only side-effect imports", `import './shared-module.js';`],
        ["only named imports", `import { foo, bar } from './shared-module.js';`],
        ["only re-exports", `export * from './shared-module.js';`],
        [
          "multiple imports and comments",
          `// This is a facade module
import './moduleA.js';
import { x } from './moduleB.js';
/* block comment */
export * from './moduleC.js';`,
        ],
        ["'use strict' and imports only", `"use strict";\nimport './shared-module.js';`],
        ["query string in facadeModuleId", `import './shared.js';`, "?query=param"],
        ["hash in facadeModuleId", `import './shared.js';`, "#hash"],
      ])("should SKIP HTML facade chunks: %s", (_, code, suffix = "") => {
        const result = renderChunk(code, {
          fileName: "page1.js",
          facadeModuleId: `/path/to/page1.html${suffix}`,
        });
        expect(result).toBeNull();
      });

      it("should inject into HTML facade with function declarations", () => {
        const result = renderChunk(`function main() { console.log("hello"); }`, {
          fileName: "index.js",
          facadeModuleId: "/path/to/index.html",
        });
        expect(result).not.toBeNull();
        expect(result?.code).toMatchInlineSnapshot(
          `"!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="c4c89e04-3658-4874-b25b-07e638185091",e._sentryDebugIdIdentifier="sentry-dbid-c4c89e04-3658-4874-b25b-07e638185091");}catch(e){}}();function main() { console.log("hello"); }"`
        );
      });

      it("should inject into HTML facade with variable declarations", () => {
        const result = renderChunk(`const x = 42;`, {
          fileName: "index.js",
          facadeModuleId: "/path/to/index.html",
        });
        expect(result).not.toBeNull();
        expect(result?.code).toMatchInlineSnapshot(
          `"!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="43e69766-1963-49f2-a291-ff8de60cc652",e._sentryDebugIdIdentifier="sentry-dbid-43e69766-1963-49f2-a291-ff8de60cc652");}catch(e){}}();const x = 42;"`
        );
      });

      it("should inject into HTML facade with substantial code (SPA main bundle)", () => {
        const code = `import { initApp } from './app.js';

const config = { debug: true };

function bootstrap() {
  initApp(config);
}

bootstrap();`;
        const result = renderChunk(code, {
          fileName: "index.js",
          facadeModuleId: "/path/to/index.html",
        });
        expect(result).not.toBeNull();
        expect(result?.code).toMatchInlineSnapshot(`
          "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="d0c4524b-496e-45a4-9852-7558d043ba3c",e._sentryDebugIdIdentifier="sentry-dbid-d0c4524b-496e-45a4-9852-7558d043ba3c");}catch(e){}}();import { initApp } from './app.js';

          const config = { debug: true };

          function bootstrap() {
            initApp(config);
          }

          bootstrap();"
        `);
      });

      it("should inject into HTML facade with mixed imports and code", () => {
        const result = renderChunk(
          `import './polyfills.js';\nimport { init } from './app.js';\n\ninit();`,
          { fileName: "index.js", facadeModuleId: "/path/to/index.html" }
        );
        expect(result).not.toBeNull();
        expect(result?.code).toMatchInlineSnapshot(`
          "!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="28f0bbaa-9aeb-40c4-98c9-4e44f1d4e175",e._sentryDebugIdIdentifier="sentry-dbid-28f0bbaa-9aeb-40c4-98c9-4e44f1d4e175");}catch(e){}}();import './polyfills.js';
          import { init } from './app.js';

          init();"
        `);
      });

      it("should inject into regular JS chunks (no HTML facade)", () => {
        const result = renderChunk(`console.log("Hello");`, { fileName: "bundle.js" });
        expect(result).not.toBeNull();
        expect(result?.code).toMatchInlineSnapshot(
          `"!function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="79f18a7f-ca16-4168-9797-906c82058367",e._sentryDebugIdIdentifier="sentry-dbid-79f18a7f-ca16-4168-9797-906c82058367");}catch(e){}}();console.log("Hello");"`
        );
      });
    });
  });
});
