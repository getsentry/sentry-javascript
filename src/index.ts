import * as rrweb from 'rrweb';
import * as Sentry from '@sentry/browser';
import { Dsn, Event } from '@sentry/types';

type RrwebEvent = {
  type: rrweb.EventType;
  data: {};
  timestamp: number;
  delay?: number;
};

export default class SentryRRWeb {
  public readonly name: string = SentryRRWeb.id;
  public static id: string = 'SentryRRWeb';
  public events: Array<RrwebEvent> = [];

  attachmentUrlFromDsn(dsn: Dsn, eventId: string) {
    const { host, path, projectId, port, protocol, user } = dsn;
    return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
      path !== '' ? `/${path}` : ''
    }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${user}&sentry_version=7&sentry_client=rrweb`;
  }

  setupOnce() {
    rrweb.record({
      emit(event: RrwebEvent, isCheckout?: boolean) {
        const self = Sentry.getCurrentHub().getIntegration(SentryRRWeb);
        self.events.push(event);
      }
    });

    Sentry.addGlobalEventProcessor((event: Event) => {
      const self = Sentry.getCurrentHub().getIntegration(SentryRRWeb);
      try {
        // short circuit if theres no events to replay
        if (!self.events.length) return;
        const client = Sentry.getCurrentHub().getClient();
        const endpoint = self.attachmentUrlFromDsn(
          client.getDsn(),
          event.event_id
        );
        const formData = new FormData();
        formData.append(
          'rrweb',
          new Blob([JSON.stringify({ events: self.events })], {
            type: 'application/json'
          }),
          'rrweb.json'
        );
        fetch(endpoint, {
          method: 'POST',
          body: formData
        }).catch(ex => {
          // we have to catch this otherwise it throws an infinite loop in Sentry
          console.error(ex);
        });
        return event;
      } catch (ex) {
        console.error(ex);
      }
    });
  }
}
