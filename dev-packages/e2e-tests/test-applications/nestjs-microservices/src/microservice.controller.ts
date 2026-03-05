import { Controller, UseGuards, UseInterceptors, UsePipes } from '@nestjs/common';
import { MessagePattern } from '@nestjs/microservices';
import * as Sentry from '@sentry/nestjs';
import { ExampleGuard } from './example.guard';
import { ExampleInterceptor } from './example.interceptor';
import { ExamplePipe } from './example.pipe';

@Controller()
export class MicroserviceController {
  @MessagePattern({ cmd: 'sum' })
  sum(data: { numbers: number[] }): number {
    return Sentry.startSpan({ name: 'microservice-sum-operation' }, () => {
      return data.numbers.reduce((a, b) => a + b, 0);
    });
  }

  @MessagePattern({ cmd: 'exception' })
  exception(data: { id: string }): never {
    throw new Error(`Microservice exception with id ${data.id}`);
  }

  @MessagePattern({ cmd: 'manual-capture' })
  manualCapture(): { success: boolean } {
    try {
      throw new Error('Manually captured microservice error');
    } catch (e) {
      Sentry.captureException(e);
    }
    return { success: true };
  }

  @UseGuards(ExampleGuard)
  @MessagePattern({ cmd: 'test-guard' })
  testGuard(): { result: string } {
    return { result: 'guard-handled' };
  }

  @UseInterceptors(ExampleInterceptor)
  @MessagePattern({ cmd: 'test-interceptor' })
  testInterceptor(): { result: string } {
    return { result: 'interceptor-handled' };
  }

  @UsePipes(ExamplePipe)
  @MessagePattern({ cmd: 'test-pipe' })
  testPipe(data: { value: number }): { result: number } {
    return { result: data.value };
  }

}
