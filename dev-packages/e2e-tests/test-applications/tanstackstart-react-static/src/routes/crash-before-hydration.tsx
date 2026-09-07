import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/crash-before-hydration')({
  component: CrashPage,
});

function CrashPage() {
  return (
    <div>
      <p>This page crashes in client.tsx before hydration</p>
    </div>
  );
}
