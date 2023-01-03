
export async function consoleGroup<T>(code: () => Promise<T>): Promise<T> {
  console.group();
  try {

    return await code();
  } finally {
    console.groupEnd();
  }
}
