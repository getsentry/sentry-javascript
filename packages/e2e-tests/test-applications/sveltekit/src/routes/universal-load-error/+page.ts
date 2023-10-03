import { browser } from '$app/environment';

export const load = () => {
  throw new Error(`Whoops - Universal Load Error (${browser ? 'client' : 'server'})!`);
  return {
    msg: "You won't see this message",
  };
};
