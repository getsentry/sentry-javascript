import { parameterize } from '@sentry/utils';

const x = 'first';
const y = 'second';

Sentry.captureMessage(parameterize`This is a log statement with ${x} and ${y} params`);
