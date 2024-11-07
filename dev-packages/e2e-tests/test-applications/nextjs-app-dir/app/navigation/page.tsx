'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function Page() {
  const router = useRouter();

  return (
    <ul>
      <li>
        <button
          onClick={() => {
            router.push('/navigation/42/router-push');
          }}
        >
          router.push()
        </button>
      </li>
      <li>
        <button
          onClick={() => {
            router.replace('/navigation/42/router-replace');
          }}
        >
          router.replace()
        </button>
      </li>
      <li>
        <button
          onClick={() => {
            router.forward();
          }}
        >
          router.forward()
        </button>
      </li>
      <li>
        <button
          onClick={() => {
            router.back();
          }}
        >
          router.back()
        </button>
      </li>
      <li>
        <Link href="/navigation/42/link">Normal Link</Link>
      </li>
      <li>
        <Link href="/navigation/42/link-replace" replace>
          Link Replace
        </Link>
      </li>
    </ul>
  );
}
