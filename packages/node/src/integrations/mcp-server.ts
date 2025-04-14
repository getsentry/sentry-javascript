import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { isWrapped } from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleFile } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { generateInstrumentOnce } from '../otel/instrument';
import { defineIntegration, wrapMcpServerWithSentry } from '@sentry/core';

const supportedVersions = ['>=1.9.0 <2'];

interface MCPServerInstance {
  tool: (toolName: string, toolSchema: unknown, handler: (...args: unknown[]) => unknown) => void;
}

interface MCPSdkModuleDef {
  McpServer: new (...args: unknown[]) => MCPServerInstance;
}

/**
 * Sentry instrumentation for MCP Servers (`@modelcontextprotocol/sdk` package)
 */
export class McpInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-modelcontextprotocol-sdk', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition[] {
    const moduleDef = new InstrumentationNodeModuleDefinition('@modelcontextprotocol/sdk', supportedVersions);

    moduleDef.files.push(
      new InstrumentationNodeModuleFile(
        '@modelcontextprotocol/sdk/server/mcp.js',
        supportedVersions,
        (moduleExports: MCPSdkModuleDef) => {
          if (isWrapped(moduleExports.McpServer)) {
            this._unwrap(moduleExports, 'McpServer');
          }

          this._wrap(moduleExports, 'McpServer', originalMcpServerClass => {
            return new Proxy(originalMcpServerClass, {
              construct(McpServerClass, mcpServerConstructorArgArray) {
                const mcpServerInstance = new McpServerClass(...mcpServerConstructorArgArray);

                return wrapMcpServerWithSentry(mcpServerInstance);
              },
            });
          });

          return moduleExports;
        },
        (moduleExports: MCPSdkModuleDef) => {
          this._unwrap(moduleExports, 'McpServer');
        },
      ),
    );

    return [moduleDef];
  }
}
const INTEGRATION_NAME = 'MCP';

const instrumentMcp = generateInstrumentOnce('MCP', () => {
  return new McpInstrumentation();
});

/**
 * Integration capturing tracing data for MCP servers (via the `@modelcontextprotocol/sdk` package).
 */
export const mcpIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMcp();
    },
  };
});
