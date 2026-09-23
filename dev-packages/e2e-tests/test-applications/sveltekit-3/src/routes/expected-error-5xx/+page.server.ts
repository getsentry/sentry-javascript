import { error } from '@sveltejs/kit';

export const load = async () => {
  // SvelteKit 3 passes expected errors to `handleError` as `kind: 'app'`.
  // 5xx are worth reporting, so the SDK captures them.
  error(500, 'Expected 500 Error');
};
