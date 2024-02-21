import { IncrementalSource, MouseInteractions, record } from '@sentry-internal/rrweb';
import type { Breadcrumb } from '@sentry/types';

import { WINDOW } from '../constants';
import type {
  RecordingEvent,
  ReplayClickDetector,
  ReplayContainer,
  ReplayMultiClickFrame,
  ReplaySlowClickFrame,
  SlowClickConfig,
} from '../types';
import { ReplayEventTypeIncrementalSnapshot } from '../types';
import { timestampToS } from '../util/timestamp';
import { addBreadcrumbEvent } from './util/addBreadcrumbEvent';
import { getClosestInteractive } from './util/domUtils';
import { onWindowOpen } from './util/onWindowOpen';

type ClickBreadcrumb = Breadcrumb & {
  timestamp: number;
};

interface Click {
  timestamp: number;
  mutationAfter?: number;
  scrollAfter?: number;
  clickBreadcrumb: ClickBreadcrumb;
  clickCount: number;
  node: HTMLElement;
}

type IncrementalRecordingEvent = RecordingEvent & {
  type: typeof ReplayEventTypeIncrementalSnapshot;
  data: { source: IncrementalSource };
};

type IncrementalMouseInteractionRecordingEvent = IncrementalRecordingEvent & {
  type: typeof ReplayEventTypeIncrementalSnapshot;
  data: { type: MouseInteractions; id: number };
};

/** Handle a click. */
export function handleClick(clickDetector: ReplayClickDetector, clickBreadcrumb: Breadcrumb, node: HTMLElement): void {
  clickDetector.handleClick(clickBreadcrumb, node);
}

/** A click detector class that can be used to detect slow or rage clicks on elements. */
export class ClickDetector implements ReplayClickDetector {
  // protected for testing
  protected _lastMutation: number;
  protected _lastScroll: number;

  private _clicks: Click[];
  private _teardown: undefined | (() => void);

  private _threshold: number;
  private _scollTimeout: number;
  private _timeout: number;
  private _ignoreSelector: string;

  private _replay: ReplayContainer;
  private _checkClickTimeout?: ReturnType<typeof setTimeout>;
  private _addBreadcrumbEvent: typeof addBreadcrumbEvent;

  public constructor(
    replay: ReplayContainer,
    slowClickConfig: SlowClickConfig,
    // Just for easier testing
    _addBreadcrumbEvent = addBreadcrumbEvent,
  ) {
    this._lastMutation = 0;
    this._lastScroll = 0;
    this._clicks = [];

    // We want everything in s, but options are in ms
    this._timeout = slowClickConfig.timeout / 1000;
    this._threshold = slowClickConfig.threshold / 1000;
    this._scollTimeout = slowClickConfig.scrollTimeout / 1000;
    this._replay = replay;
    this._ignoreSelector = slowClickConfig.ignoreSelector;
    this._addBreadcrumbEvent = _addBreadcrumbEvent;
  }

  /** Register click detection handlers on mutation or scroll. */
  public addListeners(): void {
    const cleanupWindowOpen = onWindowOpen(() => {
      // Treat window.open as mutation
      this._lastMutation = nowInSeconds();
    });

    this._teardown = () => {
      cleanupWindowOpen();

      this._clicks = [];
      this._lastMutation = 0;
      this._lastScroll = 0;
    };
  }

  /** Clean up listeners. */
  public removeListeners(): void {
    if (this._teardown) {
      this._teardown();
    }

    if (this._checkClickTimeout) {
      clearTimeout(this._checkClickTimeout);
    }
  }

  /** @inheritDoc */
  public handleClick(breadcrumb: Breadcrumb, node: HTMLElement): void {
    if (ignoreElement(node, this._ignoreSelector) || !isClickBreadcrumb(breadcrumb)) {
      return;
    }

    const newClick: Click = {
      timestamp: timestampToS(breadcrumb.timestamp),
      clickBreadcrumb: breadcrumb,
      // Set this to 0 so we know it originates from the click breadcrumb
      clickCount: 0,
      node,
    };

    // If there was a click in the last 1s on the same element, ignore it - only keep a single reference per second
    if (
      this._clicks.some(click => click.node === newClick.node && Math.abs(click.timestamp - newClick.timestamp) < 1)
    ) {
      return;
    }

    this._clicks.push(newClick);

    // If this is the first new click, set a timeout to check for multi clicks
    if (this._clicks.length === 1) {
      this._scheduleCheckClicks();
    }
  }

  /** @inheritDoc */
  public registerMutation(timestamp = Date.now()): void {
    this._lastMutation = timestampToS(timestamp);
  }

  /** @inheritDoc */
  public registerScroll(timestamp = Date.now()): void {
    this._lastScroll = timestampToS(timestamp);
  }

  /** @inheritDoc */
  public registerClick(element: HTMLElement): void {
    const node = getClosestInteractive(element);
    this._handleMultiClick(node as HTMLElement);
  }

  /** Count multiple clicks on elements. */
  private _handleMultiClick(node: HTMLElement): void {
    this._getClicks(node).forEach(click => {
      click.clickCount++;
    });
  }

  /** Get all pending clicks for a given node. */
  private _getClicks(node: HTMLElement): Click[] {
    return this._clicks.filter(click => click.node === node);
  }

  /** Check the clicks that happened. */
  private _checkClicks(): void {
    const timedOutClicks: Click[] = [];

    const now = nowInSeconds();

    this._clicks.forEach(click => {
      if (!click.mutationAfter && this._lastMutation) {
        click.mutationAfter = click.timestamp <= this._lastMutation ? this._lastMutation - click.timestamp : undefined;
      }
      if (!click.scrollAfter && this._lastScroll) {
        click.scrollAfter = click.timestamp <= this._lastScroll ? this._lastScroll - click.timestamp : undefined;
      }

      // All of these are in seconds!
      if (click.timestamp + this._timeout <= now) {
        timedOutClicks.push(click);
      }
    });

    // Remove "old" clicks
    for (const click of timedOutClicks) {
      const pos = this._clicks.indexOf(click);

      if (pos > -1) {
        this._generateBreadcrumbs(click);
        this._clicks.splice(pos, 1);
      }
    }

    // Trigger new check, unless no clicks left
    if (this._clicks.length) {
      this._scheduleCheckClicks();
    }
  }

  /** Generate matching breadcrumb(s) for the click. */
  private _generateBreadcrumbs(click: Click): void {
    const replay = this._replay;
    const hadScroll = click.scrollAfter && click.scrollAfter <= this._scollTimeout;
    const hadMutation = click.mutationAfter && click.mutationAfter <= this._threshold;

    const isSlowClick = !hadScroll && !hadMutation;
    const { clickCount, clickBreadcrumb } = click;

    // Slow click
    if (isSlowClick) {
      // If `mutationAfter` is set, it means a mutation happened after the threshold, but before the timeout
      // If not, it means we just timed out without scroll & mutation
      const timeAfterClickMs = Math.min(click.mutationAfter || this._timeout, this._timeout) * 1000;
      const endReason = timeAfterClickMs < this._timeout * 1000 ? 'mutation' : 'timeout';

      const breadcrumb: ReplaySlowClickFrame = {
        type: 'default',
        message: clickBreadcrumb.message,
        timestamp: clickBreadcrumb.timestamp,
        category: 'ui.slowClickDetected',
        data: {
          ...clickBreadcrumb.data,
          url: WINDOW.location.href,
          route: replay.getCurrentRoute(),
          timeAfterClickMs,
          endReason,
          // If clickCount === 0, it means multiClick was not correctly captured here
          // - we still want to send 1 in this case
          clickCount: clickCount || 1,
        },
      };

      this._addBreadcrumbEvent(replay, breadcrumb);
      return;
    }

    // Multi click
    if (clickCount > 1) {
      const breadcrumb: ReplayMultiClickFrame = {
        type: 'default',
        message: clickBreadcrumb.message,
        timestamp: clickBreadcrumb.timestamp,
        category: 'ui.multiClick',
        data: {
          ...clickBreadcrumb.data,
          url: WINDOW.location.href,
          route: replay.getCurrentRoute(),
          clickCount,
          metric: true,
        },
      };

      this._addBreadcrumbEvent(replay, breadcrumb);
    }
  }

  /** Schedule to check current clicks. */
  private _scheduleCheckClicks(): void {
    if (this._checkClickTimeout) {
      clearTimeout(this._checkClickTimeout);
    }

    this._checkClickTimeout = setTimeout(() => this._checkClicks(), 1000);
  }
}

const SLOW_CLICK_TAGS = ['A', 'BUTTON', 'INPUT'];

/** exported for tests only */
export function ignoreElement(node: HTMLElement, ignoreSelector: string): boolean {
  if (!SLOW_CLICK_TAGS.includes(node.tagName)) {
    return true;
  }

  // If <input> tag, we only want to consider input[type='submit'] & input[type='button']
  if (node.tagName === 'INPUT' && !['submit', 'button'].includes(node.getAttribute('type') || '')) {
    return true;
  }

  // If <a> tag, detect special variants that may not lead to an action
  // If target !== _self, we may open the link somewhere else, which would lead to no action
  // Also, when downloading a file, we may not leave the page, but still not trigger an action
  if (
    node.tagName === 'A' &&
    (node.hasAttribute('download') || (node.hasAttribute('target') && node.getAttribute('target') !== '_self'))
  ) {
    return true;
  }

  if (ignoreSelector && node.matches(ignoreSelector)) {
    return true;
  }

  return false;
}

function isClickBreadcrumb(breadcrumb: Breadcrumb): breadcrumb is ClickBreadcrumb {
  return !!(breadcrumb.data && typeof breadcrumb.data.nodeId === 'number' && breadcrumb.timestamp);
}

// This is good enough for us, and is easier to test/mock than `timestampInSeconds`
function nowInSeconds(): number {
  return Date.now() / 1000;
}

/** Update the click detector based on a recording event of rrweb. */
export function updateClickDetectorForRecordingEvent(clickDetector: ReplayClickDetector, event: RecordingEvent): void {
  try {
    // note: We only consider incremental snapshots here
    // This means that any full snapshot is ignored for mutation detection - the reason is that we simply cannot know if a mutation happened here.
    // E.g. think that we are buffering, an error happens and we take a full snapshot because we switched to session mode -
    // in this scenario, we would not know if a dead click happened because of the error, which is a key dead click scenario.
    // Instead, by ignoring full snapshots, we have the risk that we generate a false positive
    // (if a mutation _did_ happen but was "swallowed" by the full snapshot)
    // But this should be more unlikely as we'd generally capture the incremental snapshot right away

    if (!isIncrementalEvent(event)) {
      return;
    }

    const { source } = event.data;
    if (source === IncrementalSource.Mutation) {
      clickDetector.registerMutation(event.timestamp);
    }

    if (source === IncrementalSource.Scroll) {
      clickDetector.registerScroll(event.timestamp);
    }

    if (isIncrementalMouseInteraction(event)) {
      const { type, id } = event.data;
      const node = record.mirror.getNode(id);

      if (node instanceof HTMLElement && type === MouseInteractions.Click) {
        clickDetector.registerClick(node);
      }
    }
  } catch {
    // ignore errors here, e.g. if accessing something that does not exist
  }
}

function isIncrementalEvent(event: RecordingEvent): event is IncrementalRecordingEvent {
  return event.type === ReplayEventTypeIncrementalSnapshot;
}

function isIncrementalMouseInteraction(
  event: IncrementalRecordingEvent,
): event is IncrementalMouseInteractionRecordingEvent {
  return event.data.source === IncrementalSource.MouseInteraction;
}
