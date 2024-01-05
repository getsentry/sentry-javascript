import { notFound } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function PageWithRedirect() {
  return <p>Hello World!</p>;
}

export async function generateMetadata() {
  notFound();
}
