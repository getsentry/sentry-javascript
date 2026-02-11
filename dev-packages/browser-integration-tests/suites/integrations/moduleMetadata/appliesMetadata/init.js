import * as Sentry from '@sentry/browser';
import { moduleMetadataIntegration } from '@sentry/browser';

Sentry.init({
  dsn: 'https://public@dsn.ingest.sentry.io/1337',
  integrations: [moduleMetadataIntegration()],
  beforeSend(event) {
    const moduleMetadataEntries = [];

    if (event.type === undefined) {
      try {
        event.exception.values.forEach(value => {
          value.stacktrace.frames.forEach(frame => {
            moduleMetadataEntries.push(frame.module_metadata);
          });
        });
      } catch {
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
