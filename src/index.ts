import { record, EventType } from 'rrweb';
import * as Sentry from '@sentry/browser';
import { Dsn, Event } from '@sentry/types';

type RRWebEvent = {
  type: EventType;
  data: {};
  timestamp: number;
  delay?: number;
};

type RRWebOptions = Parameters<typeof record>[0];

export default class SentryRRWeb {
  public readonly name: string = SentryRRWeb.id;
  public static id: string = 'SentryRRWeb';

  public events: Array<RRWebEvent> = [];

  private readonly recordOptions: RRWebOptions;

  public constructor({
    checkoutEveryNms = 5 * 60 * 1000,
    maskAllInputs = true,
    ...recordOptions
  }: RRWebOptions = {}) {
    // default checkout time of 5 minutes
    this.recordOptions = {
      checkoutEveryNms,
      maskAllInputs,
      ...recordOptions,
    }
    this.events = [];

    record({
      ...this.recordOptions,
      emit: (event: RRWebEvent, isCheckout?: boolean) => {
        if (isCheckout) {
          this.events = [event];
        } else {
          this.events.push(event);
        }
      },
    });
  }

  public attachmentUrlFromDsn(dsn: Dsn, eventId: string) {
    const { host, path, projectId, port, protocol, user } = dsn;
    return `${protocol}://${host}${port !== '' ? `:${port}` : ''}${
      path !== '' ? `/${path}` : ''
    }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${user}&sentry_version=7&sentry_client=rrweb`;
  }

  public setupOnce() {
    Sentry.addGlobalEventProcessor((event: Event) => {
      const self = Sentry.getCurrentHub().getIntegration(SentryRRWeb);
      if (!self) return;
      try {
        // short circuit if theres no events to replay
        if (!this.events.length) return;
        const client = Sentry.getCurrentHub().getClient();
        const endpoint = self.attachmentUrlFromDsn(
          client.getDsn(),
          event.event_id
        );
        const formData = new FormData();
        formData.append(
          'rrweb',
          new Blob([JSON.stringify({ events: self.events })], {
            type: 'application/json',
          }),
          'rrweb.json'
        );
        fetch(endpoint, {
          method: 'POST',
          body: formData,
        }).catch((ex) => {
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
