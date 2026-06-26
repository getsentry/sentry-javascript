import { Controller, Get, Param, ParseIntPipe, UseGuards, UseInterceptors } from '@nestjs/common';
import { AppService } from './app.service';
import { ExampleException } from './example.exception';
import { ExampleGuard } from './example.guard';
import { ExampleInterceptor } from './example.interceptor';
import { ScheduleService } from './schedule.service';

@Controller()
export class AppController {
  public constructor(
    private readonly appService: AppService,
    private readonly scheduleService: ScheduleService,
  ) {}

  @Get('test-transaction')
  public testTransaction(): unknown {
    return this.appService.testSpan();
  }

  @Get('test-middleware')
  public testMiddleware(): unknown {
    return this.appService.testSpan();
  }

  @Get('test-guard')
  @UseGuards(ExampleGuard)
  public testGuard(): unknown {
    return {};
  }

  @Get('test-interceptor')
  @UseInterceptors(ExampleInterceptor)
  public testInterceptor(): unknown {
    return this.appService.testSpan();
  }

  @Get('test-pipe/:id')
  public testPipe(@Param('id', ParseIntPipe) id: number): unknown {
    return { value: id };
  }

  @Get('test-exception')
  public testException(): never {
    throw new ExampleException();
  }

  @Get('test-event')
  public testEvent(): unknown {
    this.appService.emitEvent();
    return { message: 'emitted' };
  }

  // Triggers the `@Timeout`-decorated handler directly (its real delay is long
  // so it never fires on its own during the test).
  @Get('trigger-timeout-error')
  public triggerTimeoutError(): unknown {
    try {
      this.scheduleService.handleTimeoutError();
    } catch {
      // Swallow, the error is captured by the schedule instrumentation; the
      // route itself should still succeed.
    }
    return { message: 'triggered' };
  }

  // Stop the auto-firing scheduled jobs so they don't keep throwing after the
  // assertions have run.
  @Get('kill-schedules')
  public killSchedules(): unknown {
    this.scheduleService.killCron('test-cron-error');
    this.scheduleService.killInterval('test-interval-error');
    return { message: 'killed' };
  }
}
