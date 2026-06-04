import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "// eslint-disable-next-line no-console
    console.log("hello world");
    //# sourceMappingURL=basic.js.map
    ",
      "basic.js.map": "{"version":3,"file":"basic.js","sources":["../../src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"names":[],"mappings":"AAAA;AACA,OAAO,CAAC,GAAG,CAAC,aAAa,CAAC"}",
    }
  `);
});
