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

    if (job.name === 'lifecycle-failed-breadcrumb-test') {
      throw new Error('Intentional error to trigger failed event');
    }

    if (job.name === 'lifecycle-progress-breadcrumb-test') {
      await job.updateProgress(50);
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

  @OnWorkerEvent('active')
  onActive(job: Job) {
    if (job.name === 'lifecycle-active-breadcrumb-test') {
      Sentry.addBreadcrumb({
        message: 'leaked-breadcrumb-from-active-event',
        level: 'info',
      });
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job) {
    if (job.name === 'lifecycle-failed-breadcrumb-test') {
      Sentry.addBreadcrumb({
        message: 'leaked-breadcrumb-from-failed-event',
        level: 'info',
      });
    }
  }

  @OnWorkerEvent('progress')
  onProgress(job: Job) {
    if (job.name === 'lifecycle-progress-breadcrumb-test') {
      Sentry.addBreadcrumb({
        message: 'leaked-breadcrumb-from-progress-event',
        level: 'info',
      });
    }
  }
}
