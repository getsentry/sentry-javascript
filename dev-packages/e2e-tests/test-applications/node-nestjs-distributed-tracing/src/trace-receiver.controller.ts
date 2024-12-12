import { Controller, Get, Headers } from '@nestjs/common';
import { TraceReceiverService } from './trace-receiver.service';

@Controller()
export class TraceReceiverController {
  constructor(private readonly traceReceiverService: TraceReceiverService) {}

  @Get('external-allowed')
  externalAllowed(@Headers() headers) {
    return this.traceReceiverService.externalAllowed(headers);
  }

  @Get('external-disallowed')
  externalDisallowed(@Headers() headers) {
    return this.traceReceiverService.externalDisallowed(headers);
  }
}
