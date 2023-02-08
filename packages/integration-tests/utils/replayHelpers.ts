import type { RecordingEvent, ReplayContainer } from '@sentry/replay/build/npm/types/types';
import type { Breadcrumb, Event, ReplayEvent } from '@sentry/types';
import type { Page, Request } from 'playwright';

import { envelopeRequestParser } from './helpers';

type CustomRecordingEvent = { tag: string; payload: Record<string, unknown> };
type PerformanceSpan = {
  op: string;
  description: string;
  startTimestamp: number;
  endTimestamp: number;
  data: Record<string, number>;
};

/**
 * Waits for a replay request to be sent by the page and returns it.
 *
 * Optionally, you can specify a segmentId to wait for a specific replay request, containing
 * the segment_id in the replay envelope.
 * This is useful for tests where you want to wait on multiple replay requests or check
 * segment order.
 *
 * @param page the playwright page object
 * @param segmentId the segment_id of the replay event
 * @returns
 */
export function waitForReplayRequest(page: Page, segmentId?: number): Promise<Request> {
  return page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      const event = envelopeRequestParser(req);

      if (!isReplayEvent(event)) {
        return false;
      }

      if (segmentId !== undefined) {
        return event.segment_id === segmentId;
      }

      return true;
    } catch {
      return false;
    }
  });
}

function isReplayEvent(event: Event): event is ReplayEvent {
  return event.type === 'replay_event';
}

/**
 * This returns the replay container (assuming it exists).
 * Note that due to how this works with playwright, this is a POJO copy of replay.
 * This means that we cannot access any methods on it, and also not mutate it in any way.
 */
export async function getReplaySnapshot(page: Page): Promise<ReplayContainer> {
  const replayIntegration = await page.evaluate<{ _replay: ReplayContainer }>('window.Replay');
  return replayIntegration._replay;
}

export const REPLAY_DEFAULT_FLUSH_MAX_DELAY = 5_000;

export function getReplayEvent(replayRequest: Request): ReplayEvent {
  const event = envelopeRequestParser(replayRequest);
  if (!isReplayEvent(event)) {
    throw new Error('Request is not a replay event');
  }
  return event;
}

/**
 * Takes an uncompressed replay request and returns the custom recording events,
 * i.e. the events we emit as type 5 rrweb events
 *
 * @param replayRequest
 * @returns an object containing the replay breadcrumbs and performance spans
 */
export function getCustomRecordingEvents(replayRequest: Request): {
  breadcrumbs: Breadcrumb[];
  performanceSpans: PerformanceSpan[];
} {
  const recordingEvents = envelopeRequestParser(replayRequest, 5) as RecordingEvent[];

  const breadcrumbs = getReplayBreadcrumbs(recordingEvents);
  const performanceSpans = getReplayPerformanceSpans(recordingEvents);
  return { breadcrumbs, performanceSpans };
}

function getAllCustomRrwebRecordingEvents(recordingEvents: RecordingEvent[]): CustomRecordingEvent[] {
  return recordingEvents.filter(event => event.type === 5).map(event => event.data as CustomRecordingEvent);
}

function getReplayBreadcrumbs(recordingEvents: RecordingEvent[], category?: string): Breadcrumb[] {
  return getAllCustomRrwebRecordingEvents(recordingEvents)
    .filter(data => data.tag === 'breadcrumb')
    .map(data => data.payload)
    .filter(payload => !category || payload.category === category);
}

function getReplayPerformanceSpans(recordingEvents: RecordingEvent[]): PerformanceSpan[] {
  return getAllCustomRrwebRecordingEvents(recordingEvents)
    .filter(data => data.tag === 'performanceSpan')
    .map(data => data.payload) as PerformanceSpan[];
}
