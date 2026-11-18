import * as Sentry from '@sentry/nextjs';

export const config = { runtime: 'edge' };

export default () => {
  Sentry.setTag('my-isolated-tag', true);
  throw new Error('Edge Route Error');
};
