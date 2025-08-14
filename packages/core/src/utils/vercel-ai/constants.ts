import type { Span } from '../../types-hoist/span';

// Global Map to track tool call IDs to their corresponding spans
// This allows us to capture tool errors and link them to the correct span
export const toolCallSpanMap = new Map<string, Span>();
