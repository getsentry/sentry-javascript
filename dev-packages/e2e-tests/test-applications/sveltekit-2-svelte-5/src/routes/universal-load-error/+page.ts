import { browser } from '$app/environment';

export const load = async () => {
  throw new Error(`Universal Load Error (${browser ? 'browser' : 'server'})`);
  return {
    msg: 'Hello World',
  };
};
