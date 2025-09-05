/**
 * This method exists in cloudflare workers.
 * Well-documented here
 * @see https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Promise/withResolvers
 * It is also possible to add support of it modifying tsconfig.json but I am not sure if it is a good idea.
 */
interface PromiseConstructor {
  withResolvers<T = unknown, E = unknown>(): {
    promise: PromiseConstructor<T>;
    resolve: (value?: T) => void;
    reject: (reason?: E) => void;
  };
}
