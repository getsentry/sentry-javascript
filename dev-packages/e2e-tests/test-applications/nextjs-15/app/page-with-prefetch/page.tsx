import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function Page() {
  await new Promise(resolve => setTimeout(resolve, 500));
  return <Link href="/prefetchable-page">prefetchable page</Link>;
}
