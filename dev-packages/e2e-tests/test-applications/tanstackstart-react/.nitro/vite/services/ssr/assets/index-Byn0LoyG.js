import { bo as createServerRpc, bp as createServerFn } from "../server.js";
import "node:async_hooks";
import "node:stream";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream/web";
const throwServerError_createServerFn_handler = createServerRpc("41399900a9fa876e415539e79e0239344988f6b8a15be321b96c32b46279e8df", (opts, signal) => throwServerError.__executeServer(opts, signal));
const throwServerError = createServerFn().handler(throwServerError_createServerFn_handler, async () => {
  throw new Error("Sentry Server Function Test Error");
});
export {
  throwServerError_createServerFn_handler
};
