import { Controller, Get, Param } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Controller()
export class AppController {
  constructor(@InjectQueue('test-queue') private readonly queue: Queue) {}

  @Get('enqueue/:name')
  async enqueue(@Param('name') name: string) {
    await this.queue.add(name, { timestamp: Date.now() });
    return { queued: true };
  }

  @Get('enqueue-with-breadcrumb')
  async enqueueWithBreadcrumb() {
    await this.queue.add('breadcrumb-test', { timestamp: Date.now() });
    return { queued: true };
  }

  @Get('check-isolation')
  checkIsolation() {
    // This endpoint is called after the processor adds a breadcrumb.
    // The test verifies that breadcrumbs from the processor do NOT leak here.
    return { message: 'ok' };
  }
}
