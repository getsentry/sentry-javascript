import type { PageServerLoad } from './$types';

export const prerender = true;

export const load: PageServerLoad = async function load() {
  return {
    message: 'From server load function.',
  };
};
