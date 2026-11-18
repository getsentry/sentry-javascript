import { builtinModules } from 'node:module';

export const nodeExternals = [...builtinModules, ...builtinModules.map(m => `node:${m}`)];
