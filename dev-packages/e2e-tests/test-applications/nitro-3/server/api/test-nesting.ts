import { startSpan } from '@sentry/nitro';
import { defineHandler } from 'nitro/h3';

export default defineHandler(() => {
  startSpan({ name: 'db.select', op: 'db' }, () => {
    // simulate a select query
  });

  startSpan({ name: 'db.insert', op: 'db' }, () => {
    startSpan({ name: 'db.serialize', op: 'serialize' }, () => {
      // simulate serializing data before insert
    });
  });

  return { status: 'ok', nesting: true };
});
