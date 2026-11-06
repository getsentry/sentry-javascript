// The package is type-checked against Svelte 4, but the Kit 3 variant only ever runs on Svelte 5.
// Declares the Svelte 5 export it uses; build-time only and never emitted.
export {};

declare module 'svelte' {
  export function untrack<T>(fn: () => T): T;
}
