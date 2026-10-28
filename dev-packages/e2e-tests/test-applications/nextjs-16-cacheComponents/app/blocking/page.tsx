import { headers } from 'next/headers';

// Opts out of the static shell: the whole page renders on the server for every request, so the
// trace meta tags land in <head> like in a classic dynamic render.
export const instant = false;

export default async function Page() {
  const requestHeaders = await headers();
  return <h1 id="blocking">Blocking render for {requestHeaders.get('user-agent') ? 'a browser' : 'nobody'}</h1>;
}
