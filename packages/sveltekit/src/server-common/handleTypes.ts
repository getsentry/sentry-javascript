import type { sequence } from '@sveltejs/kit/hooks';

/**
 * SvelteKit's `Handle` type, on both SvelteKit 2.x and 3.
 *
 * SvelteKit 3 moved `Handle` and `ResolveOptions` from `@sveltejs/kit` to `@sveltejs/kit/hooks`,
 * and SvelteKit 2 doesn't export them from `@sveltejs/kit/hooks`, so no named import resolves on
 * both majors. An unresolved import silently turns the type into `any` for users with `skipLibCheck`.
 * `sequence` lives in `@sveltejs/kit/hooks` on both majors and is typed with `Handle`.
 */
export type Handle = ReturnType<typeof sequence>;

/** SvelteKit's `ResolveOptions` type, on both SvelteKit 2.x and 3. See {@link Handle}. */
export type ResolveOptions = NonNullable<Parameters<Parameters<Handle>[0]['resolve']>[1]>;
