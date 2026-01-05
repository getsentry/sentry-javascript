import { bj as jsxRuntimeExports, bp as createServerFn } from "../server.js";
import { c as createSsrRpc } from "./createSsrRpc-mJR5gjC5.js";
import { d as wrappedServerFnMiddleware } from "./middleware-BDyeOn_H.js";
import "node:async_hooks";
import "node:stream";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream/web";
const serverFnWithMiddleware = createServerFn().middleware([wrappedServerFnMiddleware]).handler(createSsrRpc("42e6d6882d88c00a77d72cf2cca6c8d21f83261791d4de84ca75175410abed98"));
const serverFnWithoutMiddleware = createServerFn().handler(createSsrRpc("b4335b6f85930e6253fc1633f58be8021f4702741b923704df0d41b27b8e47f0"));
function TestMiddleware() {
  return /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { children: [
    /* @__PURE__ */ jsxRuntimeExports.jsx("h1", { children: "Test Middleware Page" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { id: "server-fn-middleware-btn", type: "button", onClick: async () => {
      await serverFnWithMiddleware();
    }, children: "Call server function with middleware" }),
    /* @__PURE__ */ jsxRuntimeExports.jsx("button", { id: "server-fn-global-only-btn", type: "button", onClick: async () => {
      await serverFnWithoutMiddleware();
    }, children: "Call server function (global middleware only)" })
  ] });
}
export {
  TestMiddleware as component
};
