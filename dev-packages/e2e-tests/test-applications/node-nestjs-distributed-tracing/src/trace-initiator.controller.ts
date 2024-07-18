import { Controller, Get, Headers, Param } from '@nestjs/common';
import { TraceInitiatorService } from './trace-initiator.service';

@Controller()
export class TraceInitiatorController {
  constructor(private readonly traceInitiatorService: TraceInitiatorService) {}

  @Get('test-inbound-headers/:id')
  testInboundHeaders(@Headers() headers, @Param('id') id: string) {
    return this.traceInitiatorService.testInboundHeaders(headers, id);
  }

  @Get('test-outgoing-http/:id')
  async testOutgoingHttp(@Param('id') id: string) {
    return this.traceInitiatorService.testOutgoingHttp(id);
  }

  @Get('test-outgoing-fetch/:id')
  async testOutgoingFetch(@Param('id') id: string) {
    return this.traceInitiatorService.testOutgoingFetch(id);
  }

  @Get('test-outgoing-fetch-external-allowed')
  async testOutgoingFetchExternalAllowed() {
    return this.traceInitiatorService.testOutgoingFetchExternalAllowed();
  }

  @Get('test-outgoing-fetch-external-disallowed')
  async testOutgoingFetchExternalDisallowed() {
    return this.traceInitiatorService.testOutgoingFetchExternalDisallowed();
  }

  @Get('test-outgoing-http-external-allowed')
  async testOutgoingHttpExternalAllowed() {
    return this.traceInitiatorService.testOutgoingHttpExternalAllowed();
  }

  @Get('test-outgoing-http-external-disallowed')
  async testOutgoingHttpExternalDisallowed() {
    return this.traceInitiatorService.testOutgoingHttpExternalDisallowed();
  }
}
