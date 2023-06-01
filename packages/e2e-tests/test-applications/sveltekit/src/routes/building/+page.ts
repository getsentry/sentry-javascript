import type { PageLoad } from './$types';

export const load = (async _event => {
  return { name: 'building' };
}) satisfies PageLoad;
