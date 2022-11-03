// This file will test the `excludedServersideEntrypoints` option when a route is provided as a RegExp.
const handler = async (): Promise<void> => {
  throw new Error('API Error');
};

export default handler;
