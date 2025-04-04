import Link from 'next/link';

export default function Page() {
  return (
    <Link prefetch id="prefetch-link" href="/prefetching/to-be-prefetched">
      link
    </Link>
  );
}
