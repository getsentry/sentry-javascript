import { record } from "rrweb";
import { EventType as RrwebEvent } from "rrweb/types";
import * as Sentry from "@sentry/browser";
import { Dsn, Event } from "@sentry/types";

class SentryRrweb {
  public readonly name: string = SentryRrweb.id;
  public static id: string = "SentryRrweb";
  public events: Array<RrwebEvent> = [];

  attachmentUrlFromDsn(dsn: Dsn, eventId: string) {
    const { host, path, projectId, port, protocol, user } = dsn;
    return `${protocol}://${host}${port !== "" ? `:${port}` : ""}${
      path !== "" ? `/${path}` : ""
    }/api/${projectId}/events/${eventId}/attachments/?sentry_key=${user}&sentry_version=7&sentry_client=rrweb`;
  }

  setupOnce() {
    record({
      emit(event: RrwebEvent) {
        this.rrwebEvents.push(event);
      }
    });

    Sentry.addGlobalEventProcessor((event: Event) => {
      // const self = Sentry.getCurrentHub().getIntegration(SentryRrweb);
      try {
        // short circuit if theres no events to replay
        if (!this.events.length) return;
        const client = Sentry.getCurrentHub().getClient();
        const endpoint = this.attachmentUrlFromDsn(
          client.getDsn(),
          event.event_id
        );
        const formData = new FormData();
        formData.append(
          "rrweb",
          new Blob([JSON.stringify({ events: this.events })], {
            type: "application/json"
          }),
          "rrweb.json"
        );
        fetch(endpoint, {
          method: "POST",
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

export default SentryRrweb;
