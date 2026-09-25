import { headers } from 'next/headers';

export default async function Page() {
  await headers();
  return <p id="route-b">Route b: {Date.now()}</p>;
}
