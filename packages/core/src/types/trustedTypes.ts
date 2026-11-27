// The DOM lib has no Trusted Types definitions.
// @see https://developer.mozilla.org/en-US/docs/Web/API/TrustedTypePolicy

export interface TrustedScriptURL {
  toString(): string;
}

export interface ScriptURLPolicy {
  createScriptURL(input: string): TrustedScriptURL;
}
