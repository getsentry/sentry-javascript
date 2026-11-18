import Link from 'next/link';

export default function Page() {
  return (
    <div>
      <h2>Page (/pages-router)</h2>
      <Link href="/user/5" id="navigation">
        navigate
      </Link>
    </div>
  );
}
