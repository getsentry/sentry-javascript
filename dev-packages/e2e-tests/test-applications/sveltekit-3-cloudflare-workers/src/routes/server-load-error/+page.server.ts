export const prerender = false;

export const load = async () => {
  throw new Error('Server Load Error on Cloudflare');
};
