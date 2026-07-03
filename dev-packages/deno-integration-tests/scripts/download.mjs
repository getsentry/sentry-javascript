/** Download a url to a string */
export async function download(url) {
  try {
    // `fetch` only rejects on network errors, so check the status explicitly — otherwise an error body
    // (e.g. a 404 HTML page) would be treated as success and fed to `execSync`/written to disk.
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to download', url, e);
    process.exit(1);
  }
}
