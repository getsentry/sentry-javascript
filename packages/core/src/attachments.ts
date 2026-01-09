import { getClient, getIsolationScope } from './currentScopes';
import type { Attachment } from './types-hoist/attachment';
/**
 * Records a new breadcrumb which will be attached to future events.
 *
 * Breadcrumbs will be added to subsequent events to provide more context on
 * user's actions prior to an error or crash.
 */
export function addAttachment(attachment: Attachment): void {
  const client = getClient();
  const isolationScope = getIsolationScope();

  if (!client) return;

  // const mergedAttachment = { timestamp, ...attachment };
  // const finalAttachment = beforeAttachment
  //   ? consoleSandbox(() => beforeAttachment(mergedAttachment, hint))
  //   : mergedAttachment;

  // if (finalAttachment === null) return;

  // if (client.emit) {
  //   client.emit('beforeAddAttachment', finalAttachment, hint);
  // }

  isolationScope.addAttachment(attachment);
}
