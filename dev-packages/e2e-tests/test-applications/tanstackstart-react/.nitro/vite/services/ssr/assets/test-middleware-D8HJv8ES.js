import { bo as createServerRpc, bp as createServerFn } from "../server.js";
import { d as wrappedServerFnMiddleware } from "./middleware-BDyeOn_H.js";
import "node:async_hooks";
import "node:stream";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream/web";
const serverFnWithMiddleware_createServerFn_handler = createServerRpc("42e6d6882d88c00a77d72cf2cca6c8d21f83261791d4de84ca75175410abed98", (opts, signal) => serverFnWithMiddleware.__executeServer(opts, signal));
const serverFnWithMiddleware = createServerFn().middleware([wrappedServerFnMiddleware]).handler(serverFnWithMiddleware_createServerFn_handler, async () => {
  console.log("Server function with specific middleware executed");
  return {
    message: "Server function middleware test"
  };
});
const serverFnWithoutMiddleware_createServerFn_handler = createServerRpc("b4335b6f85930e6253fc1633f58be8021f4702741b923704df0d41b27b8e47f0", (opts, signal) => serverFnWithoutMiddleware.__executeServer(opts, signal));
const serverFnWithoutMiddleware = createServerFn().handler(serverFnWithoutMiddleware_createServerFn_handler, async () => {
  console.log("Server function without specific middleware executed");
  return {
    message: "Global middleware only test"
  };
});
export {
  serverFnWithMiddleware_createServerFn_handler,
  serverFnWithoutMiddleware_createServerFn_handler
};
