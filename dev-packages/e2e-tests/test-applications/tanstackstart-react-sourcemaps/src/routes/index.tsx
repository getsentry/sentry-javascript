import { createFileRoute } from '@tanstack/react-router';
import { createServerFn } from '@tanstack/react-start';

// SOURCEMAP_MARKER_CLIENT — a comment, so it is stripped from the emitted bundles but survives in `sourcesContent`.
// `assert-build.ts` uses the markers to check that the original source reached the uploaded maps.
const throwServerError = createServerFn().handler(async () => {
  // SOURCEMAP_MARKER_SERVER
  throw new Error('Server function error from the TanStack Start source map E2E app');
});

export const Route = createFileRoute('/')({
  component: Home,
});

function Home() {
  return (
    <button type="button" onClick={() => throwServerError()}>
      Throw server function error
    </button>
  );
}
