import type { Route } from './+types/outgoing-fetch';

export async function loader({ request }: Route.LoaderArgs) {
  const response = await fetch(new URL('/api/headers', request.url));
  return Response.json(await response.json());
}
