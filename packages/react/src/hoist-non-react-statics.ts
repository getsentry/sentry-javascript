import * as hoistNonReactStaticsImport from 'hoist-non-react-statics';

// Ensure we use the default export from hoist-non-react-statics if available,
// falling back to the module itself. This handles both ESM and CJS usage.
export const hoistNonReactStatics = hoistNonReactStaticsImport.default || hoistNonReactStaticsImport;
