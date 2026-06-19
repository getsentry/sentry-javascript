import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "//#region src/basic.js
    console.log("hello world");
    //#endregion

    //# sourceMappingURL=basic.js.map",
      "basic.js.map": "{"version":3,"file":"basic.js","names":[],"sources":["../../src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"mappings":";AACA,QAAQ,IAAI,cAAc"}",
    }
  `);
});
