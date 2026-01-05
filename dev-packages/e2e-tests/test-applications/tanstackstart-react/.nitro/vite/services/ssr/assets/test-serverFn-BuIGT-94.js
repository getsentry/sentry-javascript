import { bj as jsxRuntimeExports, bp as createServerFn } from "../server.js";
import { c as createSsrRpc } from "./createSsrRpc-mJR5gjC5.js";
import "node:async_hooks";
import "node:stream";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream/web";
const testLog = createServerFn().handler(createSsrRpc("06bf4c870ccc821429ab5eab89d0d2de36d7b33456a003e6ad402f73a5001414"));
const testNestedLog = createServerFn().handler(createSsrRpc("1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf"));
function TestLog() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Test Log Page" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: async () => {
      await testLog();
    }, children: "Call server function" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { type: "button", onClick: async () => {
      await testNestedLog();
    }, children: "Call server function nested" })
  ] });
}
export {
  TestLog as component
};
