describe('benchmark', () => {
  // @ts-ignore dont care about definition
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  it('profiled-env', async () => {
    await wait(1000);
    expect(1).toBe(1);
  });
});
