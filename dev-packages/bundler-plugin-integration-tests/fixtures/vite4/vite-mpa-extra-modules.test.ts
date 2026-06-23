import { expect } from "vitest";
import { test } from "./utils";

test(import.meta.url, ({ runBundler, readOutputFiles }) => {
  runBundler();
  expect(readOutputFiles()).toMatchInlineSnapshot(`
    {
      "index.js.map": "{"version":3,"file":"index.js","sources":[],"sourcesContent":[],"names":[],"mappings":""}",
      "page1.js.map": "{"version":3,"file":"page1.js","sources":[],"sourcesContent":[],"names":[],"mappings":";"}",
      "page2.js.map": "{"version":3,"file":"page2.js","sources":[],"sourcesContent":[],"names":[],"mappings":";"}",
      "shared-module.js": "!function() {
      try {
        var e = "undefined" != typeof window ? window : "undefined" != typeof global ? global : "undefined" != typeof globalThis ? globalThis : "undefined" != typeof self ? self : {};
        e.SENTRY_RELEASE = { id: "CURRENT_SHA" };
        var n = new e.Error().stack;
        n && (e._sentryDebugIds = e._sentryDebugIds || {}, e._sentryDebugIds[n] = "00000000-0000-0000-0000-000000000000", e._sentryDebugIdIdentifier = "sentry-dbid-00000000-0000-0000-0000-000000000000");
      } catch (e2) {
      }
    }();
    (function polyfill() {
      const relList = document.createElement("link").relList;
      if (relList && relList.supports && relList.supports("modulepreload")) {
        return;
      }
      for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
        processPreload(link);
      }
      new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type !== "childList") {
            continue;
          }
          for (const node of mutation.addedNodes) {
            if (node.tagName === "LINK" && node.rel === "modulepreload")
              processPreload(node);
          }
        }
      }).observe(document, { childList: true, subtree: true });
      function getFetchOpts(link) {
        const fetchOpts = {};
        if (link.integrity)
          fetchOpts.integrity = link.integrity;
        if (link.referrerPolicy)
          fetchOpts.referrerPolicy = link.referrerPolicy;
        if (link.crossOrigin === "use-credentials")
          fetchOpts.credentials = "include";
        else if (link.crossOrigin === "anonymous")
          fetchOpts.credentials = "omit";
        else
          fetchOpts.credentials = "same-origin";
        return fetchOpts;
      }
      function processPreload(link) {
        if (link.ep)
          return;
        link.ep = true;
        const fetchOpts = getFetchOpts(link);
        fetch(link.href, fetchOpts);
      }
    })();
    function greet(name) {
      console.log(\`Hello, \${String(name)}!\`);
    }
    greet("World");
    //# sourceMappingURL=shared-module.js.map
    ",
      "shared-module.js.map": "{"version":3,"file":"shared-module.js","sources":["../../src/shared-module.js"],"sourcesContent":["// This is a shared module that is used by multiple HTML pages\\nexport function greet(name) {\\n  // eslint-disable-next-line no-console\\n  console.log(\`Hello, \${String(name)}!\`);\\n}\\n\\nexport const VERSION = \\"1.0.0\\";\\n\\n// Side effect: greet on load\\ngreet(\\"World\\");\\n"],"names":[],"mappings":";;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;;AACO,SAAS,MAAM,MAAM;AAE1B,UAAQ,IAAI,UAAU,OAAO,IAAI,CAAC,GAAG;AACvC;AAKA,MAAM,OAAO;"}",
      "src/vite-mpa-index.html": "<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Index Page</title>
      </head>
      <body>
        <h1>Index Page - No Scripts</h1>
        <!-- This page has no scripts -->
      </body>
    </html>
    ",
      "src/vite-mpa-page1.html": "<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Page 1</title>
        <script type="module" crossorigin src="/shared-module.js"></script>
      </head>
      <body>
        <h1>Page 1 - With Shared Module</h1>
        
      </body>
    </html>
    ",
      "src/vite-mpa-page2.html": "<!doctype html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <title>Page 2</title>
        <script type="module" crossorigin src="/shared-module.js"></script>
      </head>
      <body>
        <h1>Page 2 - With Shared Module</h1>
        
      </body>
    </html>
    ",
    }
  `);
});
