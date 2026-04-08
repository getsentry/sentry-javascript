import type { Route } from './+types/dynamic-param';

// Minimal loader to trigger Sentry's route instrumentation
export function loader() {
  return null;
}

export default function DynamicParamPage({ params }: Route.ComponentProps) {
  return (
    <div>
      <h1>Dynamic Param Page</h1>
      <div>Param: {params.param}</div>
    </div>
  );
}
