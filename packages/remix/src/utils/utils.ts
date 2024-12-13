import type { DataFunctionArgs } from '@remix-run/node';
import { logger } from '@sentry/core';
import type { Span } from '@sentry/core';
import { DEBUG_BUILD } from './debug-build';

/**
 *
 */
export async function storeFormDataKeys(args: DataFunctionArgs, span: Span): Promise<void> {
  try {
    // We clone the request for Remix be able to read the FormData later.
    const clonedRequest = args.request.clone();

    // This only will return the last name of multiple file uploads in a single FormData entry.
    // We can switch to `unstable_parseMultipartFormData` when it's stable.
    // https://remix.run/docs/en/main/utils/parse-multipart-form-data#unstable_parsemultipartformdata
    const formData = await clonedRequest.formData();

    formData.forEach((value, key) => {
      span.setAttribute(`remix.action_form_data.${key}`, typeof value === 'string' ? value : '[non-string value]');
    });
  } catch (e) {
    DEBUG_BUILD && logger.warn('Failed to read FormData from request', e);
  }
}
