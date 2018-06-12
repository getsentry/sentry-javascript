/**
 * Consumes the promise and logs the error when it rejects.
 * @param promise A promise to forget.
 */
export declare function forget(promise: Promise<any>): void;
/**
 * Helper to filter an array with asynchronous callbacks.
 *
 * @param array An array containing items to filter.
 * @param predicate An async predicate evaluated on every item.
 * @param thisArg Optional value passed as "this" into the callback.
 * @returns An array containing only values where the callback returned true.
 */
export declare function filterAsync<T>(array: T[], predicate: (item: T) => Promise<boolean> | boolean, thisArg?: any): Promise<T[]>;
