
export async function consoleGroup<T>(code: () => Promise<T>): Promise<T> {
  console.group();
  return code().finally(console.groupEnd);
}
