import type { PageServerLoad } from './$types';

// Opt the index route out of prerendering so it is served by the Worker and therefore
// exercises `initCloudflareSentryHandle`.
export const prerender = false;

export const load: PageServerLoad = async function load() {
  return { message: 'From server load function.' };
};
