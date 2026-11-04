// Imported first so Sentry.init() runs before any other import's side effects.
import './instrument.client';
import './early-side-effect';
import { StartClient } from '@tanstack/react-start/client';
import { StrictMode, startTransition } from 'react';
import { hydrateRoot } from 'react-dom/client';

console.log('early-breadcrumb-from-client-entry');

if (window.location.pathname === '/crash-before-hydration') {
  throw new Error('Client Entry Crash');
}

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <StartClient />
    </StrictMode>,
  );
});
