'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function Page() {
  const router = useRouter();
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(true);
  }, []);

  return (
    <ul>
      <li>
        <button
          disabled={!hydrated}
          onClick={() => {
            router.push('/navigation/42/router-push');
          }}
        >
          router.push()
        </button>
      </li>
      <li>
        <button
          disabled={!hydrated}
          onClick={() => {
            router.replace('/navigation/42/router-replace');
          }}
        >
          router.replace()
        </button>
      </li>
      <li>
        <button
          disabled={!hydrated}
          onClick={() => {
            router.forward();
          }}
        >
          router.forward()
        </button>
      </li>
      <li>
        <button
          disabled={!hydrated}
          onClick={() => {
            router.back();
          }}
        >
          router.back()
        </button>
      </li>
      <li>
        <Link href="/navigation/42/link" aria-disabled={!hydrated}>
          Normal Link
        </Link>
      </li>
      <li>
        <Link href="/navigation/42/link-replace" replace aria-disabled={!hydrated}>
          Link Replace
        </Link>
      </li>
    </ul>
  );
}
