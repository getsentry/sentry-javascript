import type { Client, ClientOptions } from '@sentry/core';
import { getClient } from '@sentry/core';
import { captureNitroRequestError } from '@sentry/server-utils';
import type { CapturedErrorContext } from 'nitro/types';
import type { NitroOptions } from '../../sdk';

type NitroClientOptions = ClientOptions & Pick<NitroOptions, 'enableNitroErrorHandler'>;

/**
 * Nitro `error` hook that captures the error, unless `enableNitroErrorHandler: false` is set in `Sentry.init()`.
 */
export async function captureErrorHook(error: Error, errorContext: CapturedErrorContext): Promise<void> {
  if (getClient<Client<NitroClientOptions>>()?.getOptions().enableNitroErrorHandler === false) {
    return;
  }

  await captureNitroRequestError(error, errorContext);
}
