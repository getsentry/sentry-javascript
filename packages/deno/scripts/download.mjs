/** Download a url to a string */
export async function download(url) {
  try {
    return await fetch(url).then(res => res.text());
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('Failed to download', url, e);
    process.exit(1);
  }
}
