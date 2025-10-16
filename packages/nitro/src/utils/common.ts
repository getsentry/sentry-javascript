/**
 *  Extracts the filename from a node command with a path.
 */
export function getFilenameFromNodeStartCommand(nodeCommand: string): string | null {
  const regex = /[^/\\]+\.[^/\\]+$/;
  const match = nodeCommand.match(regex);

  return match ? match[0] : null;
}
