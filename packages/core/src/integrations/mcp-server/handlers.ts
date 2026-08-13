/** Handler wrapping for MCP server instrumentation. */

import {
  wrapExistingHandlers as wrapExistingRegistrationHandlers,
  wrapRegistrationMethod,
} from './registrationHandlers';
import { wrapRequestHandlers } from './requestHandlers';
import type { MCPServerInstance } from './types';

/** Wraps tool registrations from both the legacy and current MCP SDK APIs. */
export function wrapToolHandlers(serverInstance: MCPServerInstance): void {
  // eslint-disable-next-line typescript/no-deprecated
  if (typeof serverInstance.tool === 'function') wrapRegistrationMethod(serverInstance, 'tool');
  if (typeof serverInstance.registerTool === 'function') wrapRegistrationMethod(serverInstance, 'registerTool');
}

/** Wraps resource registrations from both the legacy and current MCP SDK APIs. */
export function wrapResourceHandlers(serverInstance: MCPServerInstance): void {
  // eslint-disable-next-line typescript/no-deprecated
  if (typeof serverInstance.resource === 'function') wrapRegistrationMethod(serverInstance, 'resource');
  if (typeof serverInstance.registerResource === 'function') wrapRegistrationMethod(serverInstance, 'registerResource');
}

/** Wraps prompt registrations from both the legacy and current MCP SDK APIs. */
export function wrapPromptHandlers(serverInstance: MCPServerInstance): void {
  // eslint-disable-next-line typescript/no-deprecated
  if (typeof serverInstance.prompt === 'function') wrapRegistrationMethod(serverInstance, 'prompt');
  if (typeof serverInstance.registerPrompt === 'function') wrapRegistrationMethod(serverInstance, 'registerPrompt');
}

/** Wraps high-level registration callbacks and the low-level request API. */
export function wrapAllMCPHandlers(serverInstance: MCPServerInstance): void {
  wrapToolHandlers(serverInstance);
  wrapResourceHandlers(serverInstance);
  wrapPromptHandlers(serverInstance);
  wrapRequestHandlers(serverInstance);
}

/** Wraps high-level handlers which were registered before Sentry instrumentation. */
export function wrapExistingHandlers(serverInstance: MCPServerInstance): void {
  wrapExistingRegistrationHandlers(serverInstance);
}
