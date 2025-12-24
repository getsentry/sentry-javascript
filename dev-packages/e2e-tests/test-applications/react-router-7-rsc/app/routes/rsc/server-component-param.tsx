import { wrapServerComponent } from '@sentry/react-router';
import type { Route } from './+types/server-component-param';

// Wrapped parameterized server component for RSC mode
async function _ParamServerComponent({ params }: Route.ComponentProps) {
  await new Promise(resolve => setTimeout(resolve, 10));

  return (
    <main>
      <h1>Server Component with Parameter</h1>
      <p data-testid="param">Parameter: {params.param}</p>
    </main>
  );
}

export const ServerComponent = wrapServerComponent(_ParamServerComponent, {
  componentRoute: '/rsc/server-component/:param',
  componentType: 'Page',
});

// Default export for standard framework mode
// export default function ParamServerComponentPage({ params }: Route.ComponentProps) {
//   return (
//     <main>
//       <h1>Server Component with Param</h1>
//       <p data-testid="param">Param: {params.param}</p>
//     </main>
//   );
// }
