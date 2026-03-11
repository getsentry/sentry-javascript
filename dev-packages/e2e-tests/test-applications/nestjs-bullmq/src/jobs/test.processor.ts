import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import * as Sentry from '@sentry/nestjs';

@Processor('test-queue')
export class TestProcessor extends WorkerHost {
  async process(job: Job): Promise<any> {
    if (job.name === 'fail') {
      throw new Error('Test error from BullMQ processor');
    }

    if (job.name === 'breadcrumb-test') {
      Sentry.addBreadcrumb({
        message: 'leaked-breadcrumb-from-bullmq-processor',
        level: 'info',
      });
      return { processed: true };
    }

    return { processed: true };
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job) {
    if (job.name === 'lifecycle-breadcrumb-test') {
      Sentry.addBreadcrumb({
        message: 'leaked-breadcrumb-from-lifecycle-event',
        level: 'info',
      });
    }
  }
}
