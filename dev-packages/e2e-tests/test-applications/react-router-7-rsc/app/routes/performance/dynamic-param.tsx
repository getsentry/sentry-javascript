import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/dynamic-param';

function DynamicParamPage({ params }: Route.ComponentProps) {
  return (
    <main>
      <h1>Dynamic Param Page</h1>
      <p data-testid="param">Param: {params.param}</p>
    </main>
  );
}

export default wrapServerComponent(DynamicParamPage, {
  componentRoute: '/performance/with/:param',
  componentType: 'Page',
});
