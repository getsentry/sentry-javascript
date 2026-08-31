import { error } from '@sveltejs/kit';

export const load = async () => {
  // SvelteKit 3 passes expected errors to `handleError` as `kind: 'app'`.
  // 4xx are expected, so the SDK must not capture them.
  error(404, 'Expected 404 Error');
};
