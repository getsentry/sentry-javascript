'use client';

import * as Sentry from '@sentry/nextjs';
import Link from 'next/link';

export default function Home() {
  return (
    <main>
      <input
        type="button"
        value="Capture Exception"
        id="exception-button"
        onClick={() => {
          Sentry.captureException(new Error('I am a click error!'));
        }}
      />
      <Link href="/user/5" id="navigation">
        navigate
      </Link>
    </main>
  );
}
