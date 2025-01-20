import * as Sentry from '@sentry/browser';

import { moduleMetadataIntegration } from '@sentry/browser';
import { rewriteFramesIntegration } from '@sentry/browser';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [
    moduleMetadataIntegration(),
    rewriteFramesIntegration({
      iteratee: frame => {
        return {
          ...frame,
          filename: 'bloop', // something that should completely mess with module metadata association
        };
      },
    }),
  ],
  beforeSend(event) {
    const moduleMetadataEntries = [];

    if (event.type === undefined) {
      try {
        event.exception.values.forEach(value => {
          value.stacktrace.frames.forEach(frame => {
            moduleMetadataEntries.push(frame.module_metadata);
          });
        });
      } catch (e) {
        // noop
      }
    }

    event.extra = {
      ...event.extra,
      module_metadata_entries: moduleMetadataEntries,
    };

    return event;
  },
});
