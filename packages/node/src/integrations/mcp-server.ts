// import { isWrapped } from '@opentelemetry/core';
import type { InstrumentationConfig } from '@opentelemetry/instrumentation';
import { InstrumentationNodeModuleFile } from '@opentelemetry/instrumentation';
import { InstrumentationBase, InstrumentationNodeModuleDefinition } from '@opentelemetry/instrumentation';
import { SDK_VERSION } from '@sentry/core';
import { generateInstrumentOnce } from '../otel/instrument';
import { defineIntegration } from '@sentry/core';

const supportedVersions = ['> 0.0.1'];

interface MCPServerInstance {
  tool: (toolName: string, toolSchema: unknown, handler: (...args: unknown[]) => unknown) => void;
}

interface MCPSdkModuleDef {
  McpServer: new (...args: unknown[]) => MCPServerInstance;
}

const perms = [
  '@modelcontextprotocol/sdk',
  '@modelcontextprotocol/sdk/server/mcp',
  '@modelcontextprotocol/sdk/server/mcp.js',
  '@modelcontextprotocol/sdk/dist/esm/server/mcp.js',
  '@modelcontextprotocol/sdk/dist/cjs/server/mcp.js',
  '@modelcontextprotocol/sdk/dist/esm/server/mcp',
  '@modelcontextprotocol/sdk/dist/cjs/server/mcp',
  './server/mcp',
  './server/mcp.js',
];

/**
 * Todo
 */
export class McpInstrumentation extends InstrumentationBase {
  public constructor(config: InstrumentationConfig = {}) {
    super('sentry-modelcontextprotocol-sdk', SDK_VERSION, config);
  }

  /**
   * Initializes the instrumentation by defining the modules to be patched.
   */
  public init(): InstrumentationNodeModuleDefinition[] {
    const moduleDefs: InstrumentationNodeModuleDefinition[] = [];

    perms.forEach(modulePath => {
      const moduleDef = new InstrumentationNodeModuleDefinition(
        modulePath,
        supportedVersions,
        (moduleExports: MCPSdkModuleDef) => {
          console.log('module wrap', modulePath, moduleExports);
          return moduleExports;
        },
        (moduleExports: MCPSdkModuleDef) => {
          this._unwrap(moduleExports, 'McpServer');
        },
      );

      perms.forEach(filePath => {
        moduleDef.files.push(
          new InstrumentationNodeModuleFile(
            filePath,
            supportedVersions,
            (moduleExports: MCPSdkModuleDef) => {
              console.log('file wrap', filePath, moduleExports);
              return moduleExports;
            },
            (moduleExports: MCPSdkModuleDef) => {
              this._unwrap(moduleExports, 'McpServer');
            },
          ),
        );
      });

      moduleDefs.push(moduleDef);
    });

    return moduleDefs;
  }
}
const INTEGRATION_NAME = 'MCP';

const instrumentMcp = generateInstrumentOnce('MCP', () => {
  return new McpInstrumentation();
});

/**
 * Integration capturing tracing data for MCP servers.
 */
export const mcpIntegration = defineIntegration(() => {
  return {
    name: INTEGRATION_NAME,
    setupOnce() {
      instrumentMcp();
    },
  };
});

// console.log('FILE called', moduleExports);

// if (isWrapped(moduleExports.McpServer)) {
//   this._unwrap(moduleExports, 'McpServer');
// }

// console.log('WRAP called');

// this._wrap(moduleExports, 'McpServer', originalMcpServerClass => {
//   console.log('WRAPPING', originalMcpServerClass);
//   return new Proxy(originalMcpServerClass, {
//     construct(McpServerClass, mcpServerConstructorArgArray) {
//       const mcpServerInstance = new McpServerClass(...mcpServerConstructorArgArray);

//       console.log('MCP Server constructed');

//       mcpServerInstance.tool = new Proxy(mcpServerInstance.tool, {
//         apply(toolTarget, toolThisArg, toolArgArray) {
//           console.log('Tool handler called!: ', toolArgArray[0]);
//           return toolTarget.apply(toolThisArg, toolArgArray);
//         },
//       });

//       return mcpServerInstance;
//     },
//   });
// });
