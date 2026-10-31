// SOURCEMAP_MARKER_SERVER
export function getServerGreeting(): string {
  return `Rendered on request at ${new Date().toISOString()}`;
}
