import type { PageServerLoad } from './$types';

export const load = (async _event => {
  return { name: 'building (server)' };
}) satisfies PageServerLoad;
