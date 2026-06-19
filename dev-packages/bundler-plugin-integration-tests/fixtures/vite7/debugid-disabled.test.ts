import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "basic.js": "console.log("hello world");
    //# sourceMappingURL=basic.js.map
    ",
      "basic.js.map": "{"version":3,"file":"basic.js","sources":["../../src/basic.js"],"sourcesContent":["// eslint-disable-next-line no-console\\nconsole.log(\\"hello world\\");\\n"],"names":[],"mappings":"AACA,QAAQ,IAAI,aAAa;"}",
    }
  `);
});
