import { addBreadcrumb } from '../../breadcrumbs';
import { DEBUG_BUILD } from '../../debug-build';
import { debug } from '../../utils/debug-logger';
import { safeDateNow } from '../../utils/randomSafeContext';
import { MAX_MESSAGE_SIZE_FOR_CALCULATION } from './constants';
import { captureSupabaseError } from './errors';
import type { SupabaseBreadcrumb, SupabaseError } from './types';

/** Extracts message IDs from a Supabase queue response. */
export function _extractMessageIds(
  data?:
    | number
    | Array<
        | number
        | {
            [key: string]: unknown;
            msg_id?: number;
          }
      >
    | null,
): string | undefined {
  if (typeof data === 'number') {
    return String(data);
  }

  if (!Array.isArray(data)) {
    return undefined;
  }

  const ids = data
    .map(item => {
      if (typeof item === 'number') {
        return String(item);
      }
      if (item && typeof item === 'object' && 'msg_id' in item && item.msg_id != null) {
        return String(item.msg_id);
      }
      return null;
    })
    .filter(id => id !== null);

  return ids.length > 0 ? ids.join(',') : undefined;
}

/** Creates a breadcrumb for a queue operation. */
export function _createQueueBreadcrumb(
  category: string,
  queueName: string | undefined,
  data?: Record<string, unknown>,
): void {
  const breadcrumb: SupabaseBreadcrumb = {
    type: 'supabase',
    category,
    message: `${category}(${queueName || 'unknown'})`,
  };

  if (data && Object.keys(data).length > 0) {
    breadcrumb.data = data;
  }

  addBreadcrumb(breadcrumb);
}

/** Calculates the size of a message body in bytes, or undefined if too large or not serializable. */
export function _calculateMessageBodySize(message: unknown): number | undefined {
  if (!message) {
    return undefined;
  }

  try {
    const serialized = JSON.stringify(message);
    // Only return size if it's under the max limit to avoid performance issues
    if (serialized.length <= MAX_MESSAGE_SIZE_FOR_CALCULATION) {
      return serialized.length;
    }
    DEBUG_BUILD && debug.warn('Message body too large for size calculation:', serialized.length);
    return undefined;
  } catch {
    // Ignore JSON stringify errors
    return undefined;
  }
}

/** Captures a Supabase queue error with proper context and mechanism. */
export function _captureQueueError(
  error: { message: string; code?: string; details?: unknown },
  queueName: string | undefined,
  messageId?: string,
  extraContext?: Record<string, unknown>,
): void {
  const err = new Error(error.message) as SupabaseError;
  if (error.code) err.code = error.code;
  if (error.details) err.details = error.details;

  captureSupabaseError(err, 'auto.db.supabase.queue', { queueName, messageId, ...extraContext });
}

/** Parses an enqueued_at timestamp and returns the latency in milliseconds. */
export function _parseEnqueuedAtLatency(enqueuedAt: string | undefined): number | undefined {
  if (!enqueuedAt) {
    return undefined;
  }

  const timestamp = Date.parse(enqueuedAt);
  if (Number.isNaN(timestamp)) {
    DEBUG_BUILD && debug.warn('Invalid enqueued_at timestamp:', enqueuedAt);
    return undefined;
  }

  return safeDateNow() - timestamp;
}
