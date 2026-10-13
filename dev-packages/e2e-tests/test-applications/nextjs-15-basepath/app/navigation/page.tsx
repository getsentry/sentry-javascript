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
            router.push(`${window.location.origin}/my-app/navigation/42/router-push`);
          }}
        >
          Absolute URL push
        </button>
      </li>
      <li>
        <Link href="/navigation/42/link">Normal Link</Link>
      </li>
    </ul>
  );
}
