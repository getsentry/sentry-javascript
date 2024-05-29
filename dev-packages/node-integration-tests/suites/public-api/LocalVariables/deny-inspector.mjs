import { register } from 'node:module';

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

const Sentry = await import('@sentry/node');

Sentry.init({});
