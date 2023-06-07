import type { EventType } from '@sentry-internal/rrweb';
import type { Breadcrumb } from '@sentry/types';

import type {
  HistoryData,
  LargestContentfulPaintData,
  MemoryData,
  NavigationData,
  NetworkRequestData,
  PaintData,
  ResourceData,
} from './performance';

interface BaseBreadcrumbFrame {
  timestamp: number;
  /**
   * For compatibility reasons
   */
  type: string;
  category: string;
  data?: Record<string, any>;
  message?: string;
}

interface BaseDomFrameData {
  nodeId?: number;
  node?: {
    id: number;
    tagName: string;
    textContent: string;
    attributes: Record<string, any>;
  };
}

/* Breadcrumbs from Core SDK */
interface ConsoleFrameData {
  logger: string;
  arguments?: unknown[];
}
interface ConsoleFrame extends BaseBreadcrumbFrame {
  category: 'console';
  level: Breadcrumb['level'];
  message: string;
  data: ConsoleFrameData;
}

type ClickFrameData = BaseDomFrameData;
interface ClickFrame extends BaseBreadcrumbFrame {
  category: 'ui.click';
  message: string;
  data: ClickFrameData;
}

interface InputFrame extends BaseBreadcrumbFrame {
  category: 'ui.input';
  message: string;
}

/* Breadcrumbs from Replay */
interface MutationFrameData {
  count: number;
  limit: boolean;
}
interface MutationFrame extends BaseBreadcrumbFrame {
  category: 'replay.mutations';
  data: MutationFrameData;
}

interface KeyboardEventFrameData extends BaseDomFrameData {
  metaKey: boolean;
  shiftKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  key: string;
}
interface KeyboardEventFrame extends BaseBreadcrumbFrame {
  category: 'ui.keyDown';
  data: KeyboardEventFrameData;
}

interface BlurFrame extends BaseBreadcrumbFrame {
  category: 'ui.blur';
}

interface FocusFrame extends BaseBreadcrumbFrame {
  category: 'ui.focus';
}

interface SlowClickFrameData extends ClickFrameData {
  url: string;
  timeAfterClickFs: number;
  endReason: string;
}
interface SlowClickFrame extends BaseBreadcrumbFrame {
  category: 'ui.slowClickDetected';
  data: SlowClickFrameData;
}

interface OptionFrame {
  blockAllMedia: boolean;
  errorSampleRate: number;
  maskAllInputs: boolean;
  maskAllText: boolean;
  networkCaptureBodies: boolean;
  networkDetailHasUrls: boolean;
  networkRequestHasHeaders: boolean;
  networkResponseHasHeaders: boolean;
  sessionSampleRate: number;
  useCompression: boolean;
  useCompressionOption: boolean;
}

export type BreadcrumbFrame =
  | ConsoleFrame
  | ClickFrame
  | InputFrame
  | KeyboardEventFrame
  | BlurFrame
  | FocusFrame
  | SlowClickFrame
  | MutationFrame
  | BaseBreadcrumbFrame;

interface BaseSpanFrame {
  op: string;
  description: string;
  startTimestamp: number;
  endTimestamp: number;
  data?: undefined | Record<string, any>;
}

interface FetchFrame extends BaseSpanFrame {
  data: NetworkRequestData;
  op: 'resource.fetch';
}

interface HistoryFrame extends BaseSpanFrame {
  data: HistoryData;
  op: 'navigation.push';
}

interface LargestContentfulPaintFrame extends BaseSpanFrame {
  data: LargestContentfulPaintData;
  op: 'largest-contentful-paint';
}

interface MemoryFrame extends BaseSpanFrame {
  data: MemoryData;
  op: 'memory';
}

interface NavigationFrame extends BaseSpanFrame {
  data: NavigationData;
  op: 'navigation.navigate' | 'navigation.reload' | 'navigation.back_forward';
}

interface PaintFrame extends BaseSpanFrame {
  data: PaintData;
  op: 'paint';
}

interface ResourceFrame extends BaseSpanFrame {
  data: ResourceData;
  op: 'resource.css' | 'resource.iframe' | 'resource.img' | 'resource.link' | 'resource.other' | 'resource.script';
}

interface XHRFrame extends BaseSpanFrame {
  data: NetworkRequestData;
  op: 'resource.xhr';
}

export type SpanFrame =
  | BaseSpanFrame
  | FetchFrame
  | HistoryFrame
  | LargestContentfulPaintFrame
  | MemoryFrame
  | NavigationFrame
  | PaintFrame
  | ResourceFrame
  | XHRFrame;

export type ReplayFrame = BreadcrumbFrame | SpanFrame;

interface RecordingCustomEvent {
  type: EventType.Custom;
  timestamp: number;
  data: {
    tag: string;
    payload: unknown;
  };
}

export interface BreadcrumbFrameEvent extends RecordingCustomEvent {
  data: {
    tag: 'breadcrumb';
    payload: BreadcrumbFrame;
    /**
     * This will indicate to backend to additionally log as a metric
     */
    metric?: boolean;
  };
}

export interface SpanFrameEvent extends RecordingCustomEvent {
  data: {
    tag: 'performanceSpan';
    payload: SpanFrame;
  };
}

export interface OptionFrameEvent extends RecordingCustomEvent {
  data: {
    tag: 'options';
    payload: OptionFrame;
  };
}

export type ReplayFrameEvent = BreadcrumbFrameEvent | SpanFrameEvent | OptionFrameEvent;
