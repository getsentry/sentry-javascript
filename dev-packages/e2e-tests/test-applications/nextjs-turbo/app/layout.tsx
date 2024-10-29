import { HackComponentToRunSideEffectsInSentryClientConfig } from '../sentry.client.config';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <HackComponentToRunSideEffectsInSentryClientConfig />
        {children}
      </body>
    </html>
  );
}
