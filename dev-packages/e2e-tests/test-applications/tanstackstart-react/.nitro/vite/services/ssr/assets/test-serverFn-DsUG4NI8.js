import { bo as createServerRpc, bp as createServerFn, ao as startSpan } from "../server.js";
import "node:async_hooks";
import "node:stream";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream/web";
const testLog_createServerFn_handler = createServerRpc("06bf4c870ccc821429ab5eab89d0d2de36d7b33456a003e6ad402f73a5001414", (opts, signal) => testLog.__executeServer(opts, signal));
const testLog = createServerFn().handler(testLog_createServerFn_handler, async () => {
  console.log("Test log from server function");
  return {
    message: "Log created"
  };
});
const testNestedLog_createServerFn_handler = createServerRpc("1ac31c23f613ec7e58631cf789642e2feb86c58e3128324cf00d746474a044bf", (opts, signal) => testNestedLog.__executeServer(opts, signal));
const testNestedLog = createServerFn().handler(testNestedLog_createServerFn_handler, async () => {
  await startSpan({
    name: "testNestedLog"
  }, async () => {
    await testLog();
  });
  console.log("Outer test log from server function");
  return {
    message: "Nested log created"
  };
});
export {
  testLog_createServerFn_handler,
  testNestedLog_createServerFn_handler
};
