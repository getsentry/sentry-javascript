// The dev servers run the app on a worker thread, but the `NitroDevApp` constructor runs on the main
// thread, so its events go to this file instead of `GET /api/channels`.
export const MAIN_THREAD_RECORDS_FILE = '.main-thread-channels.json';
