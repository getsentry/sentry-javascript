import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles, runFileInNode }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "debugid-disabled.js": ""use strict";
    (() => {
      // src/basic.js
      console.log("hello world");
    })();
    ",
    }
  `);

  const output = runFileInNode("debugid-disabled.js");
  expect(output).toBe("hello world\n");
});
