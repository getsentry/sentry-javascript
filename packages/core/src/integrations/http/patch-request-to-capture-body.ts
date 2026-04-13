import type { Scope } from "../../scope";
import type { HttpIncomingMessage, HttpInstrumentationOptions } from "./types";

export function patchRequestToCaptureBody(
  req: HttpIncomingMessage,
  isolationScope: Scope,
  maxIncomingRequestBodySize: 'small' | 'medium' | 'always',
  integrationName: string,
): void {
  // TODO: patch the reqeust to capture the body size.
  // if it fits, attach it with isolationScope.setSDKProcessingMetadata({
  // normalizedRequest: { data: truncatedBody } })
}
