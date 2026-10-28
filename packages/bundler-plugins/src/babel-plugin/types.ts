// The public signatures use these instead of `@babel/core` types, so
// consumers do not need Babel's types installed.

export interface BabelApi {
  types: object;
}

export interface BabelPlugin {
  visitor: object;
}
