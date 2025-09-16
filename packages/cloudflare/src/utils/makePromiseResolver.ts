type PromiseWithResolvers<T, E = unknown> = {
  readonly promise: Promise<T>;
  readonly resolve: (value?: T | PromiseLike<T>) => void;
  readonly reject: (reason?: E) => void;
};
/**
 * Creates an object containing a promise, along with its corresponding resolve and reject functions.
 *
 * This method provides a convenient way to create a promise and access its resolvers externally.
 *
 * @template T - The type of the resolved value of the promise.
 * @template E - The type of the rejected value of the promise. Defaults to `unknown`.
 * @return {PromiseWithResolvers<T, E>} An object containing the promise and its resolve and reject functions.
 */
export function createPromiseResolver<T, E = unknown>(): PromiseWithResolvers<T, E> {
  if ('withResolvers' in Promise && typeof Promise.withResolvers === 'function') {
    return Promise.withResolvers();
  }
  let resolve;
  let reject;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject } as unknown as PromiseWithResolvers<T, E>;
}
