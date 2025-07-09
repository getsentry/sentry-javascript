import { register } from 'node:module';

register(
  new URL(`data:application/javascript,
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'node:inspector' || specifier === 'inspector') {
    throw new Error('Should not use node:inspector module');
  }

  return nextResolve(specifier);
}`),
  import.meta.url,
);

(async () => {
  const Sentry = await import('@sentry/node-core');
  const { setupOtel } = await import('../../../utils/setupOtel.js');

  const client = Sentry.init({});

  setupOtel(client);
})();
