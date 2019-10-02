/**
 * Consumes the promise and logs the error when it rejects.
 * @param promise A promise to forget.
 */
export function forget(promise: Promise<any>): void {
  promise.catch(e => {
    // TODO: Use a better logging mechanism
    console.error(e);
  });
}
