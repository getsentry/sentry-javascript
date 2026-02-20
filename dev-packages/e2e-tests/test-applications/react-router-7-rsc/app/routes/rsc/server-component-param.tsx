import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/server-component-param';

async function ParamServerComponent({ params }: Route.ComponentProps) {
  await new Promise(resolve => setTimeout(resolve, 10));

  return (
    <main>
      <h1>Server Component with Parameter</h1>
      <p data-testid="param">Parameter: {params.param}</p>
    </main>
  );
}

export default wrapServerComponent(ParamServerComponent, {
  componentRoute: '/rsc/server-component/:param',
  componentType: 'Page',
});
