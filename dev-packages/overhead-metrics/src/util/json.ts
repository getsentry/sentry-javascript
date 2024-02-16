/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

export type JsonObject<T> = { [k: string]: T };

export function JsonStringify<T>(object: T): string {
  return JSON.stringify(
    object,
    (_: unknown, value: any): unknown => {
      if (typeof value != 'undefined' && typeof value.toJSON == 'function') {
        return value.toJSON();
      } else if (typeof value == 'bigint') {
        return value.toString();
      } else {
        return value;
      }
    },
    2,
  );
}
