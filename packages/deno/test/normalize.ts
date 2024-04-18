/* eslint-disable complexity */
import type { sentryTypes } from '../build-test/index.js';
import { sentryUtils } from '../build-test/index.js';

type EventOrSession = sentryTypes.Event | sentryTypes.Session;

export function getNormalizedEvent(envelope: sentryTypes.Envelope): sentryTypes.Event | undefined {
  let event: sentryTypes.Event | undefined;

  sentryUtils.forEachEnvelopeItem(envelope, item => {
    const [headers, body] = item;

    if (headers.type === 'event') {
      event = body as sentryTypes.Event;
    }
  });

  return normalize(event) as sentryTypes.Event | undefined;
}

export function normalize(event: EventOrSession | undefined): EventOrSession | undefined {
  if (event === undefined) {
    return undefined;
  }

  if (eventIsSession(event)) {
    return normalizeSession(event as sentryTypes.Session);
  } else {
    return normalizeEvent(event as sentryTypes.Event);
  }
}

export function eventIsSession(data: EventOrSession): boolean {
  return !!(data as sentryTypes.Session)?.sid;
}

/**
 * Normalizes a session so that in can be compared to an expected event
 *
 * All properties that are timestamps, versions, ids or variables that may vary
 * by platform are replaced with placeholder strings
 */
function normalizeSession(session: sentryTypes.Session): sentryTypes.Session {
  if (session.sid) {
    session.sid = '{{id}}';
  }

  if (session.started) {
    session.started = 0;
  }

  if (session.timestamp) {
    session.timestamp = 0;
  }

  if (session.duration) {
    session.duration = 0;
  }

  return session;
}

/**
 * Normalizes an event so that in can be compared to an expected event
 *
 * All properties that are timestamps, versions, ids or variables that may vary
 * by platform are replaced with placeholder strings
 */
function normalizeEvent(event: sentryTypes.Event): sentryTypes.Event {
  if (event.sdk?.version) {
    event.sdk.version = '{{version}}';
  }

  if (event?.sdk?.packages) {
    for (const pkg of event?.sdk?.packages) {
      if (pkg.version) {
        pkg.version = '{{version}}';
      }
    }
  }

  if (event.contexts?.app?.app_start_time) {
    event.contexts.app.app_start_time = '{{time}}';
  }

  if (event.contexts?.typescript?.version) {
    event.contexts.typescript.version = '{{version}}';
  }

  if (event.contexts?.v8?.version) {
    event.contexts.v8.version = '{{version}}';
  }

  if (event.contexts?.runtime) {
    if (event.contexts.runtime?.version) {
      event.contexts.runtime.version = '{{version}}';
    }
  }

  if (event.contexts?.device?.arch) {
    event.contexts.device.arch = '{{arch}}';
  }

  if (event.contexts?.device?.memory_size) {
    event.contexts.device.memory_size = 0;
  }

  if (event.contexts?.device?.free_memory) {
    event.contexts.device.free_memory = 0;
  }

  if (event.contexts?.device?.processor_count) {
    event.contexts.device.processor_count = 0;
  }

  if (event.contexts?.device?.processor_frequency) {
    event.contexts.device.processor_frequency = 0;
  }

  if (event.contexts?.device?.cpu_description) {
    event.contexts.device.cpu_description = '{{cpu}}';
  }

  if (event.contexts?.device?.screen_resolution) {
    event.contexts.device.screen_resolution = '{{screen}}';
  }

  if (event.contexts?.device?.screen_density) {
    event.contexts.device.screen_density = 1;
  }

  if (event.contexts?.device?.language) {
    event.contexts.device.language = '{{language}}';
  }

  if (event.contexts?.os?.name) {
    event.contexts.os.name = '{{platform}}';
  }

  if (event.contexts?.os) {
    event.contexts.os.version = '{{version}}';
  }

  if (event.contexts?.trace) {
    event.contexts.trace.span_id = '{{id}}';
    event.contexts.trace.trace_id = '{{id}}';
    delete event.contexts.trace.tags;
  }

  if (event.start_timestamp) {
    event.start_timestamp = 0;
  }

  if (event.exception?.values?.[0].stacktrace?.frames) {
    // Exclude Deno frames since these may change between versions
    event.exception.values[0].stacktrace.frames = event.exception.values[0].stacktrace.frames.filter(
      frame => !frame.filename?.includes('deno:') && !frame.filename?.startsWith('ext:'),
    );
  }

  event.timestamp = 0;
  // deno-lint-ignore no-explicit-any
  if ((event as any).start_timestamp) {
    // deno-lint-ignore no-explicit-any
    (event as any).start_timestamp = 0;
  }

  event.event_id = '{{id}}';

  if (event.spans) {
    for (const span of event.spans) {
      // deno-lint-ignore no-explicit-any
      const spanAny = span as any;

      if (spanAny.span_id) {
        spanAny.span_id = '{{id}}';
      }

      if (spanAny.parent_span_id) {
        spanAny.parent_span_id = '{{id}}';
      }

      if (spanAny.start_timestamp) {
        spanAny.start_timestamp = 0;
      }

      if (spanAny.timestamp) {
        spanAny.timestamp = 0;
      }

      if (spanAny.trace_id) {
        spanAny.trace_id = '{{id}}';
      }
    }
  }

  if (event.breadcrumbs) {
    for (const breadcrumb of event.breadcrumbs) {
      breadcrumb.timestamp = 0;
      breadcrumb.event_id = '{{id}}';
    }
  }

  event.server_name = '{{server}}';

  return event;
}
