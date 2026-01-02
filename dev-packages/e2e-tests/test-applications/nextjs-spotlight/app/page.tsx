'use client';

export default function Home() {
  const handleClick = () => {
    throw new Error('Spotlight test error!');
  };

  return (
    <main>
      <h1>Next.js Spotlight E2E Test</h1>
      <p>This page tests that NEXT_PUBLIC_SENTRY_SPOTLIGHT env var enables Spotlight integration.</p>
      <button id="exception-button" onClick={handleClick}>
        Trigger Error
      </button>
    </main>
  );
}
