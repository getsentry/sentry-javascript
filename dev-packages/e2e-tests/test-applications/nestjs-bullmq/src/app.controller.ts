import { Controller, Get, Param } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { getActiveSpan, getIsolationScope, getRootSpan } from '@sentry/nestjs';
import { Queue } from 'bullmq';

@Controller()
export class AppController {
  constructor(@InjectQueue('test-queue') private readonly queue: Queue) {}

  @Get('enqueue/:name')
  async enqueue(@Param('name') name: string) {
    await this.queue.add(name, { timestamp: Date.now() });
    return { queued: true };
  }

  @Get('check-isolation')
  checkIsolation() {
    // This endpoint is called after the processor adds a breadcrumb. Streamed spans carry no
    // breadcrumbs, so the tests read from this attribute which of the processor's breadcrumbs
    // leaked into this request's isolation scope.
    const activeSpan = getActiveSpan();
    if (activeSpan) {
      const breadcrumbs = getIsolationScope().getScopeData().breadcrumbs;
      getRootSpan(activeSpan).setAttribute(
        'isolation_scope.leaked_breadcrumbs',
        breadcrumbs.map(breadcrumb => breadcrumb.message ?? '').filter(message => message.startsWith('leaked-')),
      );
    }

    return { message: 'ok' };
  }
}
