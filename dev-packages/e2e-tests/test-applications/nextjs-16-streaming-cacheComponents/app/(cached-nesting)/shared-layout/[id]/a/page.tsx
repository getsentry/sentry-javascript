import { headers } from 'next/headers';

export default async function Page() {
  await headers();
  return <p id="route-a">Route a: {Date.now()}</p>;
}
