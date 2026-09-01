import type { Span } from '@sentry/core';
import {
  _INTERNAL_skipAiProviderWrapping,
  debug,
  flush as sentryFlush,
  getActiveSpan,
  getClient,
  LRUMap,
  SEMANTIC_ATTRIBUTE_SENTRY_OP,
  SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN,
  SPAN_STATUS_ERROR,
  startInactiveSpan,
} from '@sentry/core';
import { GEN_AI_RESPONSE_MODEL } from '@sentry/conventions/attributes';
import { DEBUG_BUILD } from '../../debug-build';
import { ANTHROPIC_AI_INTEGRATION_NAME } from '../anthropic-ai/constants';
import type { GenAiOptions } from '../core/utils';
import { resolveAIRecordingOptions } from '../core/utils';
import { GOOGLE_GENAI_INTEGRATION_NAME } from '../google-genai/constants';
import { OPENAI_INTEGRATION_NAME } from '../openai/constants';
import {
  getOperation,
  getSpanAttributes,
  getSpanName,
  getUsageAttributes,
  isExportedSpanType,
  mergeUsageAttributes,
  type SpanAttributes,
} from './utils';
import {
  AGENT_SPAN_TYPES,
  MASTRA_EXPORTER_BRAND,
  MASTRA_EXPORTER_NAME,
  MASTRA_ORIGIN,
  MODEL_SPAN_TYPES,
} from './constants';
import type { MastraExportedSpan, MastraObservabilityExporter, MastraSpanType, MastraTracingEvent } from './types';

export type MastraExporterOptions = GenAiOptions;

interface TrackedSpan {
  span: Span;
  spanType: MastraSpanType;
  usage: SpanAttributes;
}

const FLUSH_TIMEOUT_MS = 2000;

/** Bound on the skipped-span parent walk; a cyclic chain from Mastra would otherwise hang the process. */
const MAX_PARENT_WALK_DEPTH = 100;

/** Cap on tracked spans, matching `MAX_TRACKED_PRISMA_SPANS`. Spans that never end would otherwise leak. */
const MAX_TRACKED_MASTRA_SPANS = 1000;

/** Stored in `_skipped` for a dropped span with no parent, so `get` can distinguish it from absent. */
const NO_PARENT = '';

// Same list and timing idea as LangChain: skip on the first exported event, not at
// `new Mastra()`, so a raw provider call before any Mastra run still gets its own span.
const SKIPPED_PROVIDERS = [OPENAI_INTEGRATION_NAME, ANTHROPIC_AI_INTEGRATION_NAME, GOOGLE_GENAI_INTEGRATION_NAME];

/**
 * Mastra `ObservabilityExporter` that turns tracing events into Sentry spans.
 *
 * Never calls `Sentry.init()` / `Sentry.close()` — the community `@mastra/sentry` package does both
 * and replaces the app's client. No `@mastra/*` or `node:` imports.
 */
export class SentryMastraExporter implements MastraObservabilityExporter {
  public name = MASTRA_EXPORTER_NAME;

  public readonly [MASTRA_EXPORTER_BRAND] = true;

  private readonly _spans = new LRUMap<string, TrackedSpan>(MAX_TRACKED_MASTRA_SPANS);
  /** Dropped span id -> parent id, for re-parenting descendants. */
  private readonly _skipped = new LRUMap<string, string>(MAX_TRACKED_MASTRA_SPANS);
  private readonly _options: MastraExporterOptions;

  public constructor(options: MastraExporterOptions = {}) {
    this._options = options;
  }

  /** Mastra's interface is async; the work is synchronous. */
  public async exportTracingEvent(event: MastraTracingEvent): Promise<void> {
    if (!getClient()) {
      return;
    }

    _INTERNAL_skipAiProviderWrapping(SKIPPED_PROVIDERS);

    try {
      this._handleEvent(event);
    } catch (error) {
      DEBUG_BUILD && debug.error('[Mastra] failed to export tracing event', error);
    }
  }

  /** Flush without closing the client — the app still owns it. */
  public async flush(): Promise<void> {
    await sentryFlush(FLUSH_TIMEOUT_MS);
  }

  /** End open spans, then flush. Does not close the Sentry client. */
  public async shutdown(): Promise<void> {
    for (const { span } of this._spans.values()) {
      span.end();
    }
    this._spans.clear();
    this._skipped.clear();
    await this.flush();
  }

  private _handleEvent(event: MastraTracingEvent): void {
    const span = event.exportedSpan;

    if (span.isEvent) {
      return;
    }

    // Unmapped types are recorded so children re-parent onto a surviving ancestor.
    if (!isExportedSpanType(span.type)) {
      if (event.type === 'span_started') {
        this._skipped.set(span.id, span.parentSpanId ?? NO_PARENT);
      } else if (event.type === 'span_ended') {
        this._skipped.remove(span.id);
      }
      return;
    }

    switch (event.type) {
      case 'span_started':
        this._onSpanStarted(span);
        break;
      case 'span_updated':
        this._onSpanUpdated(span);
        break;
      case 'span_ended':
        this._onSpanEnded(span);
        break;
    }
  }

  private _onSpanStarted(span: MastraExportedSpan): void {
    const parentId = this._resolveParentId(span.parentSpanId);
    const parentSpan = parentId ? this._spans.get(parentId)?.span : undefined;
    const activeSpan = getActiveSpan();

    const sentrySpan = startInactiveSpan({
      name: getSpanName(span),
      startTime: span.startTime,
      // Prefer the Mastra parent so the tree stays together; else the active request span.
      parentSpan: parentSpan ?? activeSpan,
      attributes: {
        ...this._attributesFor(span),
        [SEMANTIC_ATTRIBUTE_SENTRY_OP]: getOperation(span.type)?.op,
        [SEMANTIC_ATTRIBUTE_SENTRY_ORIGIN]: MASTRA_ORIGIN,
      },
    });

    this._trackSpan(span.id, { span: sentrySpan, spanType: span.type, usage: {} });
  }

  /** End the oldest Sentry span before `LRUMap` drops it without calling `end()`. */
  private _trackSpan(id: string, tracked: TrackedSpan): void {
    const keys = this._spans.keys();
    if (!keys.includes(id) && keys.length >= MAX_TRACKED_MASTRA_SPANS) {
      const oldestId = keys[0];
      if (oldestId !== undefined) {
        this._spans.remove(oldestId)?.span.end();
      }
    }
    this._spans.set(id, tracked);
  }

  private _onSpanUpdated(span: MastraExportedSpan): void {
    const tracked = this._spans.get(span.id);
    if (tracked) {
      tracked.span.setAttributes(this._attributesFor(span));
    }
  }

  private _onSpanEnded(span: MastraExportedSpan): void {
    const tracked = this._spans.get(span.id);
    if (!tracked) {
      DEBUG_BUILD && debug.warn(`[Mastra] no Sentry span open for ended span ${span.id} (${span.name})`);
      return;
    }

    const { span: sentrySpan } = tracked;
    sentrySpan.setAttributes(this._attributesFor(span));
    sentrySpan.updateName(getSpanName(span));

    if (MODEL_SPAN_TYPES.has(span.type)) {
      this._rollUpToParentAgent(span);
    }

    if (span.errorInfo) {
      // Status only — capturing here would duplicate the app's own report with a worse stack.
      sentrySpan.setStatus({ code: SPAN_STATUS_ERROR, message: span.errorInfo.message });
    }

    sentrySpan.end(span.endTime);
    this._spans.remove(span.id);
  }

  /** Copy model/usage onto the parent agent so the AI Agents view shows totals. */
  private _rollUpToParentAgent(span: MastraExportedSpan): void {
    const parentId = this._resolveParentId(span.parentSpanId);
    const parent = parentId ? this._spans.get(parentId) : undefined;
    if (!parent || !AGENT_SPAN_TYPES.has(parent.spanType)) {
      return;
    }

    const attrs = span.attributes ?? {};
    const rolled = mergeUsageAttributes(parent.usage, getUsageAttributes(attrs.usage));
    parent.usage = rolled;
    const model = attrs.responseModel ?? attrs.model;
    if (model !== undefined) {
      rolled[GEN_AI_RESPONSE_MODEL] = model;
    }
    parent.span.setAttributes(rolled);
  }

  /** Nearest exported ancestor of a dropped span. */
  private _resolveParentId(parentSpanId: string | undefined): string | undefined {
    let current = parentSpanId;
    for (let depth = 0; current; depth++) {
      const parentOfSkipped = this._skipped.get(current);
      if (parentOfSkipped === undefined) {
        return current;
      }
      if (depth >= MAX_PARENT_WALK_DEPTH) {
        DEBUG_BUILD && debug.warn('[Mastra] gave up walking a parent chain that is too deep or cyclic');
        return undefined;
      }
      current = parentOfSkipped === NO_PARENT ? undefined : parentOfSkipped;
    }
    return undefined;
  }

  private _attributesFor(span: MastraExportedSpan): ReturnType<typeof getSpanAttributes> {
    // Per event: the exporter can be constructed before `Sentry.init()`, when `dataCollection.genAI` does not exist yet.
    return getSpanAttributes(span, resolveAIRecordingOptions(this._options));
  }
}
