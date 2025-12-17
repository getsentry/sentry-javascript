/**
 * Extracts the SHA-256 hash from a server function pathname.
 * Server function pathnames are structured as `/_serverFn/<hash>`.
 * This function matches the pattern and returns the hash if found.
 *
 * @param pathname - the pathname of the server function
 * @returns the sha256 of the server function
 */
export function extractServerFunctionSha256(pathname: string): string | undefined {
  const serverFnMatch = pathname.match(/\/_serverFn\/([a-f0-9]{64})/);
  const functionSha256 = serverFnMatch ? serverFnMatch[1] : undefined;
  return functionSha256;
}
