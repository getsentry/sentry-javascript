import Link from 'next/link';

export default function Page() {
  return (
    <Link href="/foo/navigation-target-page" id="navigation-link">
      Navigate
    </Link>
  );
}
