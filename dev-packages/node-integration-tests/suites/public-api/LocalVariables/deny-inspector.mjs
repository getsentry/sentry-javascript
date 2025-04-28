import { register } from 'node:module';

// eslint-disable-next-line no-unused-vars
const hookScript = Buffer.from(`

  `);

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
  const Sentry = await import('@sentry/node');

  Sentry.init({});
})();
