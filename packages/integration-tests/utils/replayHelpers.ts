import type { RecordingEvent, ReplayContainer } from '@sentry/replay/build/npm/types/types';
import type { Breadcrumb, Event, ReplayEvent } from '@sentry/types';
import pako from 'pako';
import type { Page, Request, Response } from 'playwright';

import { envelopeRequestParser } from './helpers';

type CustomRecordingEvent = { tag: string; payload: Record<string, unknown> };
export type PerformanceSpan = {
  op: string;
  description: string;
  startTimestamp: number;
  endTimestamp: number;
  data: Record<string, number>;
};

export type RecordingSnapshot = {
  node: SnapshotNode;
  initialOffset: number;
};

type SnapshotNode = {
  type: number;
  id: number;
  childNodes: SnapshotNode[];
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
export function waitForReplayRequest(page: Page, segmentId?: number): Promise<Response> {
  return page.waitForResponse(res => {
    const req = res.request();

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

export function isReplayEvent(event: Event): event is ReplayEvent {
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

export function getReplayEvent(resOrReq: Request | Response): ReplayEvent {
  const replayRequest = getRequest(resOrReq);
  const event = envelopeRequestParser(replayRequest);
  if (!isReplayEvent(event)) {
    throw new Error('Request is not a replay event');
  }
  return event;
}

type CustomRecordingContent = {
  breadcrumbs: Breadcrumb[];
  performanceSpans: PerformanceSpan[];
};

type RecordingContent = {
  fullSnapshots: RecordingSnapshot[];
  incrementalSnapshots: RecordingSnapshot[];
} & CustomRecordingContent;

/**
 * Takes an uncompressed replay request and returns the custom recording events,
 * i.e. the events we emit as type 5 rrweb events
 *
 * @param replayRequest
 * @returns an object containing the replay breadcrumbs and performance spans
 */
export function getCustomRecordingEvents(resOrReq: Request | Response): CustomRecordingContent {
  const replayRequest = getRequest(resOrReq);
  const recordingEvents = getDecompressedRecordingEvents(replayRequest);

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

export function getFullRecordingSnapshots(resOrReq: Request | Response): RecordingSnapshot[] {
  const replayRequest = getRequest(resOrReq);
  const events = getDecompressedRecordingEvents(replayRequest) as RecordingEvent[];
  return events.filter(event => event.type === 2).map(event => event.data as RecordingSnapshot);
}

export function getIncrementalRecordingSnapshots(resOrReq: Request | Response): RecordingSnapshot[] {
  const replayRequest = getRequest(resOrReq);
  const events = getDecompressedRecordingEvents(replayRequest) as RecordingEvent[];
  return events.filter(event => event.type === 3).map(event => event.data as RecordingSnapshot);
}

function getDecompressedRecordingEvents(resOrReq: Request | Response): RecordingEvent[] {
  const replayRequest = getRequest(resOrReq);
  return replayEnvelopeRequestParser(replayRequest, 5) as RecordingEvent[];
}

export function getReplayRecordingContent(resOrReq: Request | Response): RecordingContent {
  const replayRequest = getRequest(resOrReq);
  const fullSnapshots = getFullRecordingSnapshots(replayRequest);
  const incrementalSnapshots = getIncrementalRecordingSnapshots(replayRequest);
  const customEvents = getCustomRecordingEvents(replayRequest);

  return { fullSnapshots, incrementalSnapshots, ...customEvents };
}

/**
 * Copy of the envelopeParser from ./helpers.ts, but with the ability
 * to decompress zlib-compressed envelope payloads which we need to inspect for replay recordings.
 * This parser can handle uncompressed as well as compressed replay recordings.
 */
const replayEnvelopeRequestParser = (request: Request | null, envelopeIndex = 2): Event => {
  const envelope = replayEnvelopeParser(request);
  return envelope[envelopeIndex] as Event;
};

const replayEnvelopeParser = (request: Request | null): unknown[] => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelopeBytes = request?.postDataBuffer() || '';

  // first, we convert the bugger to string to split and go through the uncompressed lines
  const envelopeString = envelopeBytes.toString();

  const lines = envelopeString.split('\n').map(line => {
    try {
      return JSON.parse(line);
    } catch (error) {
      // If we fail to parse a line, we _might_ have found a compressed payload,
      // so let's check if this is actually the case.
      // This is quite hacky but we can't go through `line` because the prior operations
      // seem to have altered its binary content. Hence, we take the raw envelope and
      // look up the place where the zlib compression header(0x78 0x9c) starts
      for (let i = 0; i < envelopeBytes.length; i++) {
        if (envelopeBytes[i] === 0x78 && envelopeBytes[i + 1] === 0x9c) {
          try {
            // We found a zlib-compressed payload - let's decompress it
            const payload = envelopeBytes.slice(i);
            // now we return the decompressed payload as JSON
            const decompressedPayload = pako.inflate(payload as unknown as Uint8Array, { to: 'string' });
            return JSON.parse(decompressedPayload);
          } catch {
            // Let's log that something went wrong
            return line;
          }
        }
      }

      return line;
    }
  });

  return lines;
};

/**
 * We can only test replay tests in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - CDN bundles that contain the Replay integration
 *
 * @returns `true` if we should skip the replay test
 */
export function shouldSkipReplayTest(): boolean {
  const bundle = process.env.PW_BUNDLE as string | undefined;
  return bundle != null && !bundle.includes('replay') && !bundle.includes('esm') && !bundle.includes('cjs');
}

/**
 * Takes a replay recording payload and returns a normalized string representation.
 * This is necessary because the DOM snapshots contain absolute paths to other HTML
 * files which break the tests on different machines.
 * Also, we need to normalize any time offsets as they can vary and cause flakes.
 */
export function normalize(
  obj: unknown,
  { normalizeNumberAttributes }: { normalizeNumberAttributes?: string[] } = {},
): string {
  const rawString = JSON.stringify(obj, null, 2);
  let normalizedString = rawString
    .replace(/"file:\/\/.+(\/.*\.html)"/gm, '"$1"')
    .replace(/"timeOffset":\s*-?\d+/gm, '"timeOffset": [timeOffset]');

  if (normalizeNumberAttributes?.length) {
    // We look for: "attr": "123px", "123", "123%", "123em", "123rem"
    const regex = new RegExp(
      `"(${normalizeNumberAttributes
        .map(attr => `(?:${attr})`)
        .join('|')})":\\s*"([\\d\\.]+)((?:px)|%|(?:em)(?:rem))?"`,
      'gm',
    );

    normalizedString = normalizedString.replace(regex, (_, attr, num, unit) => {
      // Remove floating points here, to ensure this is a bit less flaky
      const integer = parseInt(num, 10);
      const normalizedNum = normalizeNumberAttribute(integer);

      return `"${attr}": "${normalizedNum}${unit || ''}"`;
    });
  }

  return normalizedString;
}

/**
 * Map e.g. 16 to [0-50] or 123 to [100-150].
 */
function normalizeNumberAttribute(num: number): string {
  const step = 50;
  const stepCount = Math.floor(num / step);

  return `[${stepCount * step}-${(stepCount + 1) * step}]`;
}

/** Get a request from either a request or a response */
function getRequest(resOrReq: Request | Response): Request {
  // @ts-ignore we check this
  return typeof resOrReq.request === 'function' ? (resOrReq as Response).request() : (resOrReq as Request);
}
