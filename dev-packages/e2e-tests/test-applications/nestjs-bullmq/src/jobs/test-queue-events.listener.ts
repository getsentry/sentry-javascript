import { OnQueueEvent, QueueEventsHost, QueueEventsListener } from '@nestjs/bullmq';
import * as Sentry from '@sentry/nestjs';

@QueueEventsListener('test-queue', { lastEventId: '0-0' })
export class TestQueueEventsListener extends QueueEventsHost {
  @OnQueueEvent('completed')
  async onCompleted({ jobId, returnvalue }: { jobId: string; returnvalue: { scenario?: string } }) {
    if (returnvalue?.scenario !== 'queue-event-isolation') {
      return;
    }

    const scopeData = Sentry.getIsolationScope().getScopeData();
    const previousJobId = scopeData.tags['queue_event.job_id'] ?? null;
    const previousBreadcrumbs = scopeData.breadcrumbs
      .filter(breadcrumb => breadcrumb.category === 'bullmq.queue_event')
      .map(breadcrumb => breadcrumb.message);

    Sentry.setTag('queue_event.job_id', jobId);
    Sentry.addBreadcrumb({
      category: 'bullmq.queue_event',
      message: `leaked-breadcrumb-from-queue-event-${jobId}`,
    });
    await Promise.resolve();

    Sentry.captureMessage(`BullMQ queue lifecycle callback ${jobId}`, {
      extra: { previousJobId, previousBreadcrumbs },
    });
  }
}
