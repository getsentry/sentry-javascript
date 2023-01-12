/* eslint-disable max-lines */
import type {
  AppContext,
  Contexts,
  CultureContext,
  DeviceContext,
  Event,
  EventProcessor,
  Integration,
  OsContext,
} from '@sentry/types';
import { execFile } from 'child_process';
import { readdir, readFile } from 'fs';
import * as os from 'os';
import { join } from 'path';
import { promisify } from 'util';

// TODO: Required until we drop support for Node v8
export const readFileAsync = promisify(readFile);
export const readDirAsync = promisify(readdir);

interface DeviceContextOptions {
  cpu?: boolean;
  memory?: boolean;
}

interface ContextOptions {
  app?: boolean;
  os?: boolean;
  device?: DeviceContextOptions | boolean;
  culture?: boolean;
}

/** Add node modules / packages to the event */
export class Context implements Integration {
  /**
   * @inheritDoc
   */
  public static id: string = 'Context';

  /**
   * @inheritDoc
   */
  public name: string = Context.id;

  /**
   * Caches context so it's only evaluated once
   */
  private _cachedContext: Promise<Contexts> | undefined;

  public constructor(private readonly _options: ContextOptions = { app: true, os: true, device: true, culture: true }) {
    //
  }

  /**
   * @inheritDoc
   */
  public setupOnce(addGlobalEventProcessor: (callback: EventProcessor) => void): void {
    addGlobalEventProcessor(event => this.addContext(event));
  }

  /** Processes an event and adds context */
  public async addContext(event: Event): Promise<Event> {
    if (this._cachedContext === undefined) {
      this._cachedContext = this._getContexts();
    }

    const updatedContext = this._updateContext(await this._cachedContext);

    event.contexts = {
      ...event.contexts,
      app: { ...updatedContext.app, ...event.contexts?.app },
      os: { ...updatedContext.os, ...event.contexts?.os },
      device: { ...updatedContext.device, ...event.contexts?.device },
      culture: { ...updatedContext.culture, ...event.contexts?.culture },
    };

    return event;
  }

  /**
   * Updates the context with dynamic values that can change
   */
  private _updateContext(contexts: Contexts): Contexts {
    // Only update properties if they exist
    if (contexts?.app?.app_memory) {
      contexts.app.app_memory = process.memoryUsage().rss;
    }

    if (contexts?.device?.free_memory) {
      contexts.device.free_memory = os.freemem();
    }

    return contexts;
  }

  /**
   * Gets the contexts for the current environment
   */
  private async _getContexts(): Promise<Contexts> {
    const contexts: Contexts = {};

    if (this._options.os) {
      contexts.os = await getOsContext();
    }

    if (this._options.app) {
      contexts.app = getAppContext();
    }

    if (this._options.device) {
      contexts.device = getDeviceContext(this._options.device);
    }

    if (this._options.culture) {
      const culture = getCultureContext();

      if (culture) {
        contexts.culture = culture;
      }
    }

    return contexts;
  }
}

/**
 * Returns the operating system context.
 *
 * Based on the current platform, this uses a different strategy to provide the
 * most accurate OS information. Since this might involve spawning subprocesses
 * or accessing the file system, this should only be executed lazily and cached.
 *
 *  - On macOS (Darwin), this will execute the `sw_vers` utility. The context
 *    has a `name`, `version`, `build` and `kernel_version` set.
 *  - On Linux, this will try to load a distribution release from `/etc` and set
 *    the `name`, `version` and `kernel_version` fields.
 *  - On all other platforms, only a `name` and `version` will be returned. Note
 *    that `version` might actually be the kernel version.
 */
async function getOsContext(): Promise<OsContext> {
  const platformId = os.platform();
  switch (platformId) {
    case 'darwin':
      return getDarwinInfo();
    case 'linux':
      return getLinuxInfo();
    default:
      return {
        name: PLATFORM_NAMES[platformId] || platformId,
        version: os.release(),
      };
  }
}

function getCultureContext(): CultureContext | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    if (typeof (process.versions as unknown as any).icu !== 'string') {
      // Node was built without ICU support
      return;
    }

    // Check that node was built with full Intl support. Its possible it was built without support for non-English
    // locales which will make resolvedOptions inaccurate
    //
    // https://nodejs.org/api/intl.html#detecting-internationalization-support
    const january = new Date(9e8);
    const spanish = new Intl.DateTimeFormat('es', { month: 'long' });
    if (spanish.format(january) === 'enero') {
      const options = Intl.DateTimeFormat().resolvedOptions();

      return {
        locale: options.locale,
        timezone: options.timeZone,
      };
    }
  } catch (err) {
    //
  }

  return;
}

function getAppContext(): AppContext {
  const app_memory = process.memoryUsage().rss;
  const app_start_time = new Date(Date.now() - process.uptime() * 1000).toISOString();

  return { app_start_time, app_memory };
}

/**
 * Gets device information from os
 */
export function getDeviceContext(deviceOpt: DeviceContextOptions | true): DeviceContext {
  const device: DeviceContext = {};

  // os.uptime or its return value seem to be undefined in certain environments (e.g. Azure functions).
  // Hence, we only set boot time, if we get a valid uptime value.
  // @see https://github.com/getsentry/sentry-javascript/issues/5856
  const uptime = os.uptime && os.uptime();
  if (typeof uptime === 'number') {
    device.boot_time = new Date(Date.now() - uptime * 1000).toISOString();
  }

  device.arch = os.arch();

  if (deviceOpt === true || deviceOpt.memory) {
    device.memory_size = os.totalmem();
    device.free_memory = os.freemem();
  }

  if (deviceOpt === true || deviceOpt.cpu) {
    const cpuInfo: os.CpuInfo[] | undefined = os.cpus();
    if (cpuInfo && cpuInfo.length) {
      const firstCpu = cpuInfo[0];

      device.processor_count = cpuInfo.length;
      device.cpu_description = firstCpu.model;
      device.processor_frequency = firstCpu.speed;
    }
  }

  return device;
}

/** Mapping of Node's platform names to actual OS names. */
const PLATFORM_NAMES: { [platform: string]: string } = {
  aix: 'IBM AIX',
  freebsd: 'FreeBSD',
  openbsd: 'OpenBSD',
  sunos: 'SunOS',
  win32: 'Windows',
};

/** Linux version file to check for a distribution. */
interface DistroFile {
  /** The file name, located in `/etc`. */
  name: string;
  /** Potential distributions to check. */
  distros: string[];
}

/** Mapping of linux release files located in /etc to distributions. */
const LINUX_DISTROS: DistroFile[] = [
  { name: 'fedora-release', distros: ['Fedora'] },
  { name: 'redhat-release', distros: ['Red Hat Linux', 'Centos'] },
  { name: 'redhat_version', distros: ['Red Hat Linux'] },
  { name: 'SuSE-release', distros: ['SUSE Linux'] },
  { name: 'lsb-release', distros: ['Ubuntu Linux', 'Arch Linux'] },
  { name: 'debian_version', distros: ['Debian'] },
  { name: 'debian_release', distros: ['Debian'] },
  { name: 'arch-release', distros: ['Arch Linux'] },
  { name: 'gentoo-release', distros: ['Gentoo Linux'] },
  { name: 'novell-release', distros: ['SUSE Linux'] },
  { name: 'alpine-release', distros: ['Alpine Linux'] },
];

/** Functions to extract the OS version from Linux release files. */
const LINUX_VERSIONS: {
  [identifier: string]: (content: string) => string | undefined;
} = {
  alpine: content => content,
  arch: content => matchFirst(/distrib_release=(.*)/, content),
  centos: content => matchFirst(/release ([^ ]+)/, content),
  debian: content => content,
  fedora: content => matchFirst(/release (..)/, content),
  mint: content => matchFirst(/distrib_release=(.*)/, content),
  red: content => matchFirst(/release ([^ ]+)/, content),
  suse: content => matchFirst(/VERSION = (.*)\n/, content),
  ubuntu: content => matchFirst(/distrib_release=(.*)/, content),
};

/**
 * Executes a regular expression with one capture group.
 *
 * @param regex A regular expression to execute.
 * @param text Content to execute the RegEx on.
 * @returns The captured string if matched; otherwise undefined.
 */
function matchFirst(regex: RegExp, text: string): string | undefined {
  const match = regex.exec(text);
  return match ? match[1] : undefined;
}

/** Loads the macOS operating system context. */
async function getDarwinInfo(): Promise<OsContext> {
  // Default values that will be used in case no operating system information
  // can be loaded. The default version is computed via heuristics from the
  // kernel version, but the build ID is missing.
  const darwinInfo: OsContext = {
    kernel_version: os.release(),
    name: 'Mac OS X',
    version: `10.${Number(os.release().split('.')[0]) - 4}`,
  };

  try {
    // We try to load the actual macOS version by executing the `sw_vers` tool.
    // This tool should be available on every standard macOS installation. In
    // case this fails, we stick with the values computed above.

    const output = await new Promise<string>((resolve, reject) => {
      execFile('/usr/bin/sw_vers', (error: Error | null, stdout: string) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(stdout);
      });
    });

    darwinInfo.name = matchFirst(/^ProductName:\s+(.*)$/m, output);
    darwinInfo.version = matchFirst(/^ProductVersion:\s+(.*)$/m, output);
    darwinInfo.build = matchFirst(/^BuildVersion:\s+(.*)$/m, output);
  } catch (e) {
    // ignore
  }

  return darwinInfo;
}

/** Returns a distribution identifier to look up version callbacks. */
function getLinuxDistroId(name: string): string {
  return name.split(' ')[0].toLowerCase();
}

/** Loads the Linux operating system context. */
async function getLinuxInfo(): Promise<OsContext> {
  // By default, we cannot assume anything about the distribution or Linux
  // version. `os.release()` returns the kernel version and we assume a generic
  // "Linux" name, which will be replaced down below.
  const linuxInfo: OsContext = {
    kernel_version: os.release(),
    name: 'Linux',
  };

  try {
    // We start guessing the distribution by listing files in the /etc
    // directory. This is were most Linux distributions (except Knoppix) store
    // release files with certain distribution-dependent meta data. We search
    // for exactly one known file defined in `LINUX_DISTROS` and exit if none
    // are found. In case there are more than one file, we just stick with the
    // first one.
    const etcFiles = await readDirAsync('/etc');
    const distroFile = LINUX_DISTROS.find(file => etcFiles.includes(file.name));
    if (!distroFile) {
      return linuxInfo;
    }

    // Once that file is known, load its contents. To make searching in those
    // files easier, we lowercase the file contents. Since these files are
    // usually quite small, this should not allocate too much memory and we only
    // hold on to it for a very short amount of time.
    const distroPath = join('/etc', distroFile.name);
    const contents = ((await readFileAsync(distroPath, { encoding: 'utf-8' })) as string).toLowerCase();

    // Some Linux distributions store their release information in the same file
    // (e.g. RHEL and Centos). In those cases, we scan the file for an
    // identifier, that basically consists of the first word of the linux
    // distribution name (e.g. "red" for Red Hat). In case there is no match, we
    // just assume the first distribution in our list.
    const { distros } = distroFile;
    linuxInfo.name = distros.find(d => contents.indexOf(getLinuxDistroId(d)) >= 0) || distros[0];

    // Based on the found distribution, we can now compute the actual version
    // number. This is different for every distribution, so several strategies
    // are computed in `LINUX_VERSIONS`.
    const id = getLinuxDistroId(linuxInfo.name);
    linuxInfo.version = LINUX_VERSIONS[id](contents);
  } catch (e) {
    // ignore
  }

  return linuxInfo;
}
