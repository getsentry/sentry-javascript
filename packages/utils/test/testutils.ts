export const testOnlyIfNodeVersionAtLeast = (minVersion: number): jest.It => {
  const currentNodeVersion = process.env.NODE_VERSION;

  try {
    if (Number(currentNodeVersion?.split('.')[0]) < minVersion) {
      return it.skip;
    }
  } catch (oO) {
    // we can't tell, so err on the side of running the test
  }

  return it;
};

export function parseEnvelope(env: string): Array<Record<any, any>> {
  return env.split('\n').map(e => JSON.parse(e));
}
