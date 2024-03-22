import type { Page, Request, Response } from '@playwright/test';
/* eslint-disable max-lines */
import type { ReplayCanvasIntegrationOptions } from '@sentry-internal/replay-canvas';
import type {
  InternalEventContext,
  RecordingEvent,
  ReplayContainer,
  ReplayPluginOptions,
  Session,
} from '@sentry-internal/replay/build/npm/types/types';
import type { fullSnapshotEvent, incrementalSnapshotEvent } from '@sentry-internal/rrweb';
import { EventType } from '@sentry-internal/rrweb';
import type { ReplayEventWithTime } from '@sentry/browser';
import type { Breadcrumb, Event, ReplayEvent, ReplayRecordingMode } from '@sentry/types';
import pako from 'pako';

import { envelopeRequestParser } from './helpers';

type CustomRecordingEvent = { tag: string; payload: Record<string, unknown> };
export type PerformanceSpan = {
  op: string;
  description: string;
  startTimestamp: number;
  endTimestamp: number;
  data: Record<string, number>;
};

export type FullRecordingSnapshot = ReplayEventWithTime & {
  timestamp: 0;
  data: fullSnapshotEvent['data'];
};

export type IncrementalRecordingSnapshot = ReplayEventWithTime & {
  timestamp: 0;
  data: incrementalSnapshotEvent['data'];
};

export type RecordingSnapshot = FullRecordingSnapshot | IncrementalRecordingSnapshot;

/** Returns the replay event from the given request, or undefined if this is not a replay request. */
export function getReplayEventFromRequest(req: Request): ReplayEvent | undefined {
  const postData = req.postData();
  if (!postData) {
    return undefined;
  }

  try {
    const event = envelopeRequestParser(req);

    if (!isReplayEvent(event)) {
      return undefined;
    }

    return event;
  } catch {
    return undefined;
  }
}
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
export function waitForReplayRequest(
  page: Page,
  segmentIdOrCallback?: number | ((event: ReplayEvent, res: Response) => boolean),
  timeout?: number,
): Promise<Response> {
  const segmentId = typeof segmentIdOrCallback === 'number' ? segmentIdOrCallback : undefined;
  const callback = typeof segmentIdOrCallback === 'function' ? segmentIdOrCallback : undefined;

  return page.waitForResponse(
    res => {
      const req = res.request();

      const event = getReplayEventFromRequest(req);

      if (!event) {
        return false;
      }

      try {
        if (callback) {
          return callback(event, res);
        }

        if (segmentId !== undefined) {
          return event.segment_id === segmentId;
        }

        return true;
      } catch {
        return false;
      }
    },
    timeout ? { timeout } : undefined,
  );
}

/**
 * Collect replay requests until a given callback is satisfied.
 * This can be used to ensure we wait correctly,
 *  when we don't know in which request a certain replay event/snapshot will be.
 */
export function collectReplayRequests(
  page: Page,
  callback: (replayRecordingEvents: RecordingSnapshot[], replayEvents: ReplayEvent[]) => boolean,
): Promise<{ replayEvents: ReplayEvent[]; replayRecordingSnapshots: RecordingSnapshot[] }> {
  const replayEvents: ReplayEvent[] = [];
  const replayRecordingSnapshots: RecordingSnapshot[] = [];

  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  const promise = page.waitForResponse(res => {
    const req = res.request();

    const event = getReplayEventFromRequest(req);

    if (!event) {
      return false;
    }

    replayEvents.push(event);
    replayRecordingSnapshots.push(...getDecompressedRecordingEvents(req));

    try {
      return callback(replayRecordingSnapshots, replayEvents);
    } catch {
      return false;
    }
  });

  const replayRequestPromise = async (): Promise<{
    replayEvents: ReplayEvent[];
    replayRecordingSnapshots: RecordingSnapshot[];
  }> => {
    await promise;
    return { replayEvents, replayRecordingSnapshots };
  };

  return replayRequestPromise();
}

/**
 * Wait until a callback returns true, collecting all replay responses along the way.
 * This can be useful when you don't know if stuff will be in one or multiple replay requests.
 */
export async function waitForReplayRequests(
  page: Page,
  callback: (event: ReplayEvent, res: Response) => boolean,
  timeout?: number,
): Promise<Response[]> {
  const responses: Response[] = [];

  await page.waitForResponse(
    res => {
      const req = res.request();

      const event = getReplayEventFromRequest(req);

      if (!event) {
        return false;
      }

      responses.push(res);

      try {
        return callback(event, res);
      } catch {
        return false;
      }
    },
    timeout ? { timeout } : undefined,
  );

  return responses;
}

export function isReplayEvent(event: Event): event is ReplayEvent {
  return event.type === 'replay_event';
}

function isIncrementalSnapshot(event: RecordingEvent): event is IncrementalRecordingSnapshot {
  return event.type === EventType.IncrementalSnapshot;
}

function isFullSnapshot(event: RecordingEvent): event is FullRecordingSnapshot {
  return event.type === EventType.FullSnapshot;
}

export function isCustomSnapshot(event: RecordingEvent): event is RecordingEvent & { data: CustomRecordingEvent } {
  return event.type === EventType.Custom;
}

/** Wait for replay to be running & available. */
export async function waitForReplayRunning(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const replayIntegration = (window as unknown as Window & { Replay: { _replay: ReplayContainer } }).Replay;
    const replay = replayIntegration._replay;

    return replay.isEnabled() && replay.session?.id !== undefined;
  });
}

/**
 * This returns the replay container (assuming it exists).
 * Note that due to how this works with playwright, this is a POJO copy of replay.
 * This means that we cannot access any methods on it, and also not mutate it in any way.
 */
export function getReplaySnapshot(page: Page): Promise<{
  _isPaused: boolean;
  _isEnabled: boolean;
  _context: InternalEventContext;
  _options: ReplayPluginOptions;
  _canvas: ReplayCanvasIntegrationOptions | undefined;
  _hasCanvas: boolean;
  session: Session | undefined;
  recordingMode: ReplayRecordingMode;
}> {
  return page.evaluate(() => {
    const replayIntegration = (
      window as unknown as Window & {
        Replay: { _replay: ReplayContainer & { _canvas: ReplayCanvasIntegrationOptions | undefined } };
      }
    ).Replay;
    const replay = replayIntegration._replay;

    const replaySnapshot = {
      _isPaused: replay.isPaused(),
      _isEnabled: replay.isEnabled(),
      _context: replay.getContext(),
      _options: replay.getOptions(),
      _canvas: replay['_canvas'],
      // We cannot pass the function through as this is serialized
      _hasCanvas: typeof replay['_canvas']?.getCanvasManager === 'function',
      session: replay.session,
      recordingMode: replay.recordingMode,
    };

    return replaySnapshot;
  });
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
  optionsEvents: CustomRecordingEvent[];
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
  return recordingEvents.filter(isCustomSnapshot).map(event => event.data);
}

export function getReplayBreadcrumbs(recordingEvents: RecordingSnapshot[], category?: string): Breadcrumb[] {
  return getAllCustomRrwebRecordingEvents(recordingEvents)
    .filter(data => data.tag === 'breadcrumb')
    .map(data => data.payload)
    .filter(payload => !category || payload.category === category);
}

export function getReplayPerformanceSpans(recordingEvents: RecordingSnapshot[]): PerformanceSpan[] {
  return getAllCustomRrwebRecordingEvents(recordingEvents)
    .filter(data => data.tag === 'performanceSpan')
    .map(data => data.payload) as PerformanceSpan[];
}

export function getFullRecordingSnapshots(resOrReq: Request | Response): FullRecordingSnapshot[] {
  const replayRequest = getRequest(resOrReq);
  const events = getDecompressedRecordingEvents(replayRequest);
  return events.filter(isFullSnapshot);
}

export function getIncrementalRecordingSnapshots(resOrReq: Request | Response): IncrementalRecordingSnapshot[] {
  const replayRequest = getRequest(resOrReq);
  const events = getDecompressedRecordingEvents(replayRequest);
  return events.filter(isIncrementalSnapshot);
}

function getOptionsEvents(replayRequest: Request): CustomRecordingEvent[] {
  const events = getDecompressedRecordingEvents(replayRequest);
  return getAllCustomRrwebRecordingEvents(events).filter(data => data.tag === 'options');
}

export function getDecompressedRecordingEvents(resOrReq: Request | Response): RecordingSnapshot[] {
  const replayRequest = getRequest(resOrReq);
  return (
    (replayEnvelopeRequestParser(replayRequest, 5) as ReplayEventWithTime[])
      .sort((a, b) => a.timestamp - b.timestamp)
      // source 1 is MouseMove, which is a bit flaky and we don't care about
      .filter(
        event => typeof event.data === 'object' && event.data && (event.data as Record<string, unknown>).source !== 1,
      )
      .map(event => {
        return { ...event, timestamp: 0 } as RecordingSnapshot;
      })
  );
}

export function getReplayRecordingContent(resOrReq: Request | Response): RecordingContent {
  const replayRequest = getRequest(resOrReq);
  const fullSnapshots = getFullRecordingSnapshots(replayRequest);
  const incrementalSnapshots = getIncrementalRecordingSnapshots(replayRequest);
  const customEvents = getCustomRecordingEvents(replayRequest);
  const optionsEvents = getOptionsEvents(replayRequest);

  return { fullSnapshots, incrementalSnapshots, optionsEvents, ...customEvents };
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

export function replayEnvelopeIsCompressed(resOrReq: Request | Response): boolean {
  const request = getRequest(resOrReq);

  // https://develop.sentry.dev/sdk/envelopes/
  const envelopeBytes = request.postDataBuffer() || '';

  // first, we convert the bugger to string to split and go through the uncompressed lines
  const envelopeString = envelopeBytes.toString();

  const lines: boolean[] = envelopeString.split('\n').map(line => {
    try {
      JSON.parse(line);
    } catch (error) {
      // If we fail to parse a line, we _might_ have found a compressed payload,
      // so let's check if this is actually the case.
      // This is quite hacky but we can't go through `line` because the prior operations
      // seem to have altered its binary content. Hence, we take the raw envelope and
      // look up the place where the zlib compression header(0x78 0x9c) starts
      for (let i = 0; i < envelopeBytes.length; i++) {
        if (envelopeBytes[i] === 0x78 && envelopeBytes[i + 1] === 0x9c) {
          // We found a zlib-compressed payload
          return true;
        }
      }
    }

    return false;
  });

  return lines.some(line => line);
}

export const replayEnvelopeParser = (request: Request | null): unknown[] => {
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
    .replace(/"timeOffset":\s*-?\d+/gm, '"timeOffset": [timeOffset]')
    .replace(/"timestamp":\s*0/gm, '"timestamp": [timestamp]');

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
  // @ts-expect-error we check this
  return typeof resOrReq.request === 'function' ? (resOrReq as Response).request() : (resOrReq as Request);
}
