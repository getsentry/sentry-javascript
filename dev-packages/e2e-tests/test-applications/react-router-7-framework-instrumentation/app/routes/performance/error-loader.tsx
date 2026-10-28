import type { Route } from './+types/error-loader';

export function loader({ params }: Route.LoaderArgs): never {
  throw new Error(`Loader error for testing (${params.id})`);
}

export default function ErrorLoaderPage() {
  return (
    <div>
      <h1>Error Loader Page</h1>
      <p>This should not render</p>
    </div>
  );
}
