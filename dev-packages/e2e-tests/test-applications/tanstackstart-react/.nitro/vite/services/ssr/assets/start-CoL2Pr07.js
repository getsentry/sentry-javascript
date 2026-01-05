import { c as createMiddleware, a as wrappedGlobalFunctionMiddleware, b as wrappedGlobalRequestMiddleware } from "./middleware-BDyeOn_H.js";
import "../server.js";
import "node:async_hooks";
import "node:stream";
import "util";
import "crypto";
import "async_hooks";
import "stream";
import "node:stream/web";
function dedupeSerializationAdapters(deduped, serializationAdapters) {
  for (let i = 0, len = serializationAdapters.length; i < len; i++) {
    const current = serializationAdapters[i];
    if (!deduped.has(current)) {
      deduped.add(current);
      if (current.extends) {
        dedupeSerializationAdapters(deduped, current.extends);
      }
    }
  }
}
const createStart = (getOptions) => {
  return {
    getOptions: async () => {
      const options = await getOptions();
      if (options.serializationAdapters) {
        const deduped = /* @__PURE__ */ new Set();
        dedupeSerializationAdapters(
          deduped,
          options.serializationAdapters
        );
        options.serializationAdapters = Array.from(deduped);
      }
      return options;
    },
    createMiddleware
  };
};
const startInstance = createStart(() => {
  return {
    requestMiddleware: [wrappedGlobalRequestMiddleware],
    functionMiddleware: [wrappedGlobalFunctionMiddleware]
  };
});
export {
  startInstance
};
