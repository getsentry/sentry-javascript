import { json } from '@remix-run/node';
import { useLoaderData } from '@remix-run/react';
import { getServerGreeting } from '../lib/greeting.server';

export function loader() {
  return json({ greeting: getServerGreeting() });
}

export default function Index() {
  const { greeting } = useLoaderData<typeof loader>();
  return <h1>Sourcemaps test app: {greeting}</h1>;
}
