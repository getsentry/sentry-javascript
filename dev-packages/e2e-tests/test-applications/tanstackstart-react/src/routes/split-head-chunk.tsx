import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/split-head-chunk')({
  component: SplitHeadChunk,
});

function SplitHeadChunk() {
  return (
    <main>
      <h1>Split head chunk</h1>
      <p>The root document carries a long attribute ahead of the head, so the SSR stream splits inside it.</p>
    </main>
  );
}
