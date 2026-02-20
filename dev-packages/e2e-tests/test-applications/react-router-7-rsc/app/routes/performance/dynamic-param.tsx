import type { Route } from './+types/dynamic-param';

export default function DynamicParamPage({ params }: Route.ComponentProps) {
  return (
    <main>
      <h1>Dynamic Param Page</h1>
      <p data-testid="param">Param: {params.param}</p>
    </main>
  );
}
