import { isURLObjectRelative, parseStringToURLObject } from '../../utils/url';
import { METHOD_CONFIGS } from './config';
import type { ExtraHandlerData } from './types';

/**
 * Extracts target info from method and params based on method type
 */
export function extractTargetInfo(
  method: string,
  params: Record<string, unknown>,
): {
  target?: string;
  attributes: Record<string, string>;
} {
  const config = METHOD_CONFIGS[method as keyof typeof METHOD_CONFIGS];
  if (!config) {
    return { attributes: {} };
  }

  const target =
    config.targetField && typeof params?.[config.targetField] === 'string'
      ? (params[config.targetField] as string)
      : undefined;

  return {
    target,
    attributes: target && config.targetAttribute ? { [config.targetAttribute]: target } : {},
  };
}

/**
 * Extracts request arguments based on method type
 */
export function getRequestArguments(method: string, params: Record<string, unknown>): Record<string, string> {
  const args: Record<string, string> = {};
  const config = METHOD_CONFIGS[method as keyof typeof METHOD_CONFIGS];

  if (!config) {
    return args;
  }

  // Capture arguments from the configured field
  if (config.captureArguments && config.argumentsField && params?.[config.argumentsField]) {
    const argumentsObj = params[config.argumentsField];
    if (typeof argumentsObj === 'object' && argumentsObj !== null) {
      for (const [key, value] of Object.entries(argumentsObj as Record<string, unknown>)) {
        args[`mcp.request.argument.${key.toLowerCase()}`] = JSON.stringify(value);
      }
    }
  }

  // Capture specific fields as arguments
  if (config.captureUri && params?.uri) {
    args['mcp.request.argument.uri'] = JSON.stringify(params.uri);
  }

  if (config.captureName && params?.name) {
    args['mcp.request.argument.name'] = JSON.stringify(params.name);
  }

  return args;
}

/**
 * Extracts additional attributes for specific notification types
 */
export function getNotificationAttributes(method: string, params: Record<string, unknown>): Record<string, string | number> {
  const attributes: Record<string, string | number> = {};

  switch (method) {
    case 'notifications/cancelled':
      if (params?.requestId) {
        attributes['mcp.cancelled.request_id'] = String(params.requestId);
      }
      if (params?.reason) {
        attributes['mcp.cancelled.reason'] = String(params.reason);
      }
      break;

    case 'notifications/message':
      if (params?.level) {
        attributes['mcp.logging.level'] = String(params.level);
      }
      if (params?.logger) {
        attributes['mcp.logging.logger'] = String(params.logger);
      }
      if (params?.data !== undefined) {
        attributes['mcp.logging.data_type'] = typeof params.data;
        // Store the actual message content
        if (typeof params.data === 'string') {
          attributes['mcp.logging.message'] = params.data;
        } else {
          attributes['mcp.logging.message'] = JSON.stringify(params.data);
        }
      }
      break;

    case 'notifications/progress':
      if (params?.progressToken) {
        attributes['mcp.progress.token'] = String(params.progressToken);
      }
      if (typeof params?.progress === 'number') {
        attributes['mcp.progress.current'] = params.progress;
      }
      if (typeof params?.total === 'number') {
        attributes['mcp.progress.total'] = params.total;
        if (typeof params?.progress === 'number') {
          attributes['mcp.progress.percentage'] = (params.progress / params.total) * 100;
        }
      }
      if (params?.message) {
        attributes['mcp.progress.message'] = String(params.message);
      }
      break;

    case 'notifications/resources/updated':
      if (params?.uri) {
        attributes['mcp.resource.uri'] = String(params.uri);
        // Extract protocol from URI
        const urlObject = parseStringToURLObject(String(params.uri));
        if (urlObject && !isURLObjectRelative(urlObject)) {
          attributes['mcp.resource.protocol'] = urlObject.protocol.replace(':', '');
        }
      }
      break;

    case 'notifications/initialized':
      attributes['mcp.lifecycle.phase'] = 'initialization_complete';
      attributes['mcp.protocol.ready'] = 1;
      break;
  }

  return attributes;
}

/**
 * Extracts attributes from tool call results for tracking
 * Captures actual content for debugging and monitoring
 *
 * @param method The MCP method name (should be 'tools/call')
 * @param result The raw CallToolResult object returned by the tool handler
 */
export function extractToolResultAttributes(
  method: string,
  result: unknown,
): Record<string, string | number | boolean> {
  const attributes: Record<string, string | number | boolean> = {};

  // Only process tool call results
  if (method !== 'tools/call' || !result || typeof result !== 'object') {
    return attributes;
  }

  // The result is the raw CallToolResult object from the tool handler
  const toolResult = result as {
    content?: Array<{ type?: string; text?: string; [key: string]: unknown }>;
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  };

  // Track if result is an error
  if (toolResult.isError !== undefined) {
    attributes['mcp.tool.result.is_error'] = toolResult.isError;
  }

  // Track content metadata and actual content
  if (toolResult.content && Array.isArray(toolResult.content)) {
    attributes['mcp.tool.result.content_count'] = toolResult.content.length;

    // Track content types
    const types = toolResult.content.map(c => c.type).filter((type): type is string => typeof type === 'string');

    if (types.length > 0) {
      attributes['mcp.tool.result.content_types'] = types.join(',');
    }

    // Track actual content - serialize the full content array
    try {
      attributes['mcp.tool.result.content'] = JSON.stringify(toolResult.content);
    } catch (error) {
      // If serialization fails, store a fallback message
      attributes['mcp.tool.result.content'] = '[Content serialization failed]';
    }
  }

  // Track structured content if exists
  if (toolResult.structuredContent !== undefined) {
    attributes['mcp.tool.result.has_structured_content'] = true;

    // Track actual structured content
    try {
      attributes['mcp.tool.result.structured_content'] = JSON.stringify(toolResult.structuredContent);
    } catch (error) {
      // If serialization fails, store a fallback message
      attributes['mcp.tool.result.structured_content'] = '[Structured content serialization failed]';
    }
  }

  return attributes;
}

/**
 * Extracts arguments from handler parameters for handler-level instrumentation
 */
export function extractHandlerArguments(handlerType: string, args: unknown[]): Record<string, string> {
  const arguments_: Record<string, string> = {};
  
  // Find the first argument that is not the extra object
  const firstArg = args.find(arg => 
    arg && 
    typeof arg === 'object' && 
    !('requestId' in arg)
  );
  
  if (!firstArg) {
    return arguments_;
  }

  if (handlerType === 'tool' || handlerType === 'prompt') {
    // For tools and prompts, first arg contains the arguments
    if (typeof firstArg === 'object' && firstArg !== null) {
      for (const [key, value] of Object.entries(firstArg as Record<string, unknown>)) {
        arguments_[`mcp.request.argument.${key.toLowerCase()}`] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
  } else if (handlerType === 'resource') {
    // For resources, we might have URI and variables
    // First argument is usually the URI (resource name)
    // Second argument might be variables for template expansion
    const uriArg = args[0];
    if (typeof uriArg === 'string' || uriArg instanceof URL) {
      arguments_['mcp.request.argument.uri'] = JSON.stringify(uriArg.toString());
    }
    
    // Check if second argument is variables (not the extra object)
    const secondArg = args[1];
    if (secondArg && typeof secondArg === 'object' && !('requestId' in secondArg)) {
      for (const [key, value] of Object.entries(secondArg as Record<string, unknown>)) {
        arguments_[`mcp.request.argument.${key.toLowerCase()}`] = typeof value === 'string' ? value : JSON.stringify(value);
      }
    }
  }

  return arguments_;
}

/**
 * Extracts client connection information
 */
export function extractClientInfo(extra: ExtraHandlerData): {
  address?: string;
  port?: number;
} {
  return {
    address:
      extra?.requestInfo?.remoteAddress ||
      extra?.clientAddress ||
      extra?.request?.ip ||
      extra?.request?.connection?.remoteAddress,
    port: extra?.requestInfo?.remotePort || extra?.clientPort || extra?.request?.connection?.remotePort,
  };
} 