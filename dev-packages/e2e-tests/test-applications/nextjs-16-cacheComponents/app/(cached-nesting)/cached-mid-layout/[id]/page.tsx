import { headers } from 'next/headers';

export default async function Page() {
  await headers();
  return <p id="dynamic-leaf">Dynamic leaf: {Date.now()}</p>;
}
