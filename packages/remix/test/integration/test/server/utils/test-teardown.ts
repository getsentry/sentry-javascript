function exitServer(): void {
  globalThis.__REMIX_SERVER__.close();
}

export default exitServer;
