import { expect } from "vitest";
import { readAllFiles } from "../utils";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, createTempDir }) => {
  const tempDir = createTempDir();

  runBundler({ SENTRY_TEST_OVERRIDE_TEMP_DIR: tempDir });
  const files = readAllFiles(tempDir);
  expect(files).toMatchInlineSnapshot(`
    {
      "252e0338-8927-4f52-bd57-188131defd0f-0.js": "// eslint-disable-next-line no-console
    !function(){try{var e="undefined"!=typeof window?window:"undefined"!=typeof global?global:"undefined"!=typeof globalThis?globalThis:"undefined"!=typeof self?self:{};e.SENTRY_RELEASE={id:"CURRENT_SHA"};var n=(new e.Error).stack;n&&(e._sentryDebugIds=e._sentryDebugIds||{},e._sentryDebugIds[n]="00000000-0000-0000-0000-000000000000",e._sentryDebugIdIdentifier="sentry-dbid-00000000-0000-0000-0000-000000000000");}catch(e){}}();console.log("hello world");
    //# debugId=00000000-0000-0000-0000-000000000000
    //# sourceMappingURL=basic.js.map
    ",
      "252e0338-8927-4f52-bd57-188131defd0f-0.js.map": "{"version":3,"file":"basic.js","sources":["../../src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"names":[],"mappings":"AAAA,CAAA,CAAA,CAAA,MAAA,CAAA,OAAA,CAAA,IAAA,CAAA,IAAA,CAAA,EAAA,CAAA;scACA,OAAO,CAAC,GAAG,CAAC,CAAA,KAAA,CAAA,KAAA,CAAa,CAAC","debugId":"252e0338-8927-4f52-bd57-188131defd0f","debug_id":"252e0338-8927-4f52-bd57-188131defd0f"}",
    }
  `);
});
