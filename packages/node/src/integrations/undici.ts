import type { Hub } from '@sentry/core';
import type { EventProcessor, Integration } from '@sentry/types';
import type DiagnosticsChannel from 'diagnostics_channel';

/** */
export class Undici implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Undici';

  /**
   * @inheritDoc
   */
  public name: string = Undici.id;

  // Have to hold all built channels in memory otherwise they get garbage collected
  // See: https://github.com/nodejs/node/pull/42714
  // This has been fixed in Node 19+
  private _channels: Map<string, DiagnosticsChannel.Channel> = new Map();

  /**
   * @inheritDoc
   */
  public setupOnce(_addGlobalEventProcessor: (callback: EventProcessor) => void, _getCurrentHub: () => Hub): void {
    let ds: typeof DiagnosticsChannel | undefined;
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      ds = require('diagnostics_channel') as typeof DiagnosticsChannel;
    } catch (e) {
      // no-op
    }

    if (!ds) {
      return;
    }

    // https://github.com/nodejs/undici/blob/main/docs/api/DiagnosticsChannel.md
    const undiciChannel = ds.channel('undici:request');
  }

  private _setupChannel(name: Parameters<typeof DiagnosticsChannel.channel>[0]): void {
    const channel = DiagnosticsChannel.channel(name);
    if (node)
  }
}
