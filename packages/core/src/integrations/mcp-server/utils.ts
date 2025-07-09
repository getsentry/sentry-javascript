/**
 * @deprecated This file is being refactored. Import functions from their specific modules instead:
 * - config.ts for METHOD_CONFIGS  
 * - extraction.ts for data extraction functions
 * - spans.ts for span creation functions
 * - transport.ts for transport utilities
 */

// Re-export functions for backward compatibility
export {
  createMcpNotificationSpan,
  createMcpOutgoingNotificationSpan,
  createMcpHandlerSpan,
} from './spans';
