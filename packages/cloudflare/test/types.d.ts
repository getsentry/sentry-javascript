// Not required in TypeScript 5.7+
interface PromiseConstructor {
  withResolvers<T = unknown, E = unknown>(): {
    promise: PromiseConstructor<T>;
    resolve: (value?: T) => void;
    reject: (err: E) => void;
  };
}
