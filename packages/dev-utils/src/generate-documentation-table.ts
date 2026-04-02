type Bundler = "webpack" | "vite" | "rollup" | "esbuild";

type OptionDocumentation = {
  name: string;
  fullDescription: string;
  type?: string;
  children?: OptionDocumentation[];
  supportedBundlers?: Bundler[];
};

const options: OptionDocumentation[] = [
  {
    name: "org",
    type: "string",
    fullDescription:
      "The slug of the Sentry organization associated with the app.\n\nThis value can also be specified via the `SENTRY_ORG` environment variable.",
  },
  {
    name: "project",
    type: "string | string[]",
    fullDescription:
      "The slug of the Sentry project associated with the app. You can also provide an array of project slugs to upload source maps to multiple projects with the same release.\n\nThis value can also be specified via the `SENTRY_PROJECT` environment variable. To specify multiple projects via the environment variable, separate them with commas: `SENTRY_PROJECT=project1,project2,project3`.",
  },
  {
    name: "authToken",
    type: "string",
    fullDescription:
      "The authentication token to use for all communication with Sentry.\nCan be obtained from https://sentry.io/orgredirect/organizations/:orgslug/settings/auth-tokens/.\n\nThis value can also be specified via the `SENTRY_AUTH_TOKEN` environment variable.\n\nCheck out the docs on organization tokens: https://docs.sentry.io/product/accounts/auth-tokens/#organization-auth-tokens",
  },
  {
    name: "url",
    type: "string",
    fullDescription:
      "The base URL of your Sentry instance. Use this if you are using a self-hosted or Sentry instance other than sentry.io.\n\nThis value can also be set via the SENTRY_URL environment variable.\n\nDefaults to https://sentry.io/, which is the correct value for SaaS customers.",
  },
  {
    name: "headers",
    type: "Record<string, string>",
    fullDescription: "Additional headers to send with every outgoing request to Sentry.",
  },
  {
    name: "debug",
    type: "boolean",
    fullDescription:
      'Enable debug information logs during build-time. Enabling this will give you, for example, logs about source maps. This option also propagates the debug flag to the Sentry CLI by setting the `SENTRY_LOG_LEVEL` environment variable to `"debug"` if it\'s not already set. If you have explicitly set `SENTRY_LOG_LEVEL`, this option will be ignored. Defaults to `false`.',
  },
  {
    name: "silent",
    type: "boolean",
    fullDescription:
      "Suppresses all build logs (all log levels, including errors). Defaults to `false`.",
  },
  {
    name: "errorHandler",
    type: "(err: Error) => void",
    fullDescription: `When an error occurs during release creation or sourcemaps upload, the plugin will call this function.

By default, the plugin will simply throw an error, thereby stopping the bundling process. If an \`errorHandler\` callback is provided, compilation will continue, unless an error is thrown in the provided callback.

To allow compilation to continue but still emit a warning, set this option to the following:

\`\`\`
errorHandler: (err) => {
  console.warn(err);
}
\`\`\`
`,
  },
  {
    name: "telemetry",
    type: "boolean",
    fullDescription:
      "If this flag is `true`, internal plugin errors and performance data will be sent to Sentry. It will not collect any sensitive or user-specific data.\n\nAt Sentry, we like to use Sentry ourselves to deliver faster and more stable products. We're very careful of what we're sending. We won't collect anything other than error and high-level performance data. We will never collect your code or any details of the projects in which you're using this plugin.\n\nDefaults to `true`.",
  },
  {
    name: "disable",
    type: "boolean",
    fullDescription: "Completely disables all functionality of the plugin. Defaults to `false`.",
  },
  {
    name: "sourcemaps",
    fullDescription: "Options related to source maps upload and processing.",
    children: [
      {
        name: "assets",
        type: "string | string[]",
        fullDescription:
          "A glob or an array of globs that specify the build artifacts and source maps that will be uploaded to Sentry.\n\nThe globbing patterns must follow the implementation of the `glob` package: https://www.npmjs.com/package/glob#glob-primer\n\nIf this option is not specified, the plugin will try to upload all JavaScript files and source map files that are created during build.\n\nUse the `debug` option to print information about which files end up being uploaded.",
      },
      {
        name: "ignore",
        type: "string | string[]",
        fullDescription:
          "A glob or an array of globs that specifies which build artifacts should not be uploaded to Sentry.\n\nThe globbing patterns must follow the implementation of the `glob` package: https://www.npmjs.com/package/glob#glob-primer\n\nUse the `debug` option to print information about which files end up being uploaded.\n\nDefault: `[]`",
      },
      {
        name: "rewriteSources",
        type: "(source: string, map: any, context?: { mapDir: string }) => string",
        fullDescription:
          "Hook to rewrite the `sources` field inside the source map before being uploaded to Sentry. Does not modify the actual source map. Effectively, this modifies how files inside the stacktrace will show up in Sentry.\n\nThe `context.mapDir` parameter provides the directory path of the source map file, which is useful for resolving relative source paths (e.g. `path.resolve(context.mapDir, source)`).\n\nDefaults to making all sources relative to `process.cwd()` while building.",
      },
      {
        name: "resolveSourceMap",
        type: "(artifactPath: string, sourceMappingUrl: string | undefined) => string | undefined | Promise<string | undefined>",
        fullDescription: `Hook to customize source map file resolution.

The hook is called with the absolute path of the build artifact and the value of the \`//# sourceMappingURL=\`
comment, if present. The hook should then return an absolute path (or a promise that resolves to one) indicating
where to find the artifact's corresponding source map file. If no path is returned or the returned path doesn't
exist, the standard source map resolution process will be used.

The standard process first tries to resolve based on the \`//# sourceMappingURL=\` value (it supports \`file://\`
urls and absolute/relative paths). If that path doesn't exist, it then looks for a file named
\`\${artifactName}.map\` in the same directory as the artifact.

Note: This is mostly helpful for complex builds with custom source map generation. For example, if you put source
maps into a separate directory and rewrite the \`//# sourceMappingURL=\` comment to something other than a relative
directory, sentry will be unable to locate the source maps for a given build artifact. This hook allows you to
implement the resolution process yourself.

Use the \`debug\` option to print information about source map resolution.
`,
      },
      {
        name: "filesToDeleteAfterUpload",
        type: "string | string[] | Promise<string | string[]>",
        fullDescription:
          "A glob, an array of globs or a promise resolving a glob or array of globs that specifies the build artifacts that should be deleted after the artifact upload to Sentry has been completed.\n\nNote: If you pass in a Promise that resolves to a string or array, the plugin will await the Promise and use the resolved value globs. This is useful if you need to dynamically determine the files to delete. Some higher-level Sentry SDKs or options use this feature (e.g., SvelteKit).\n\nThe globbing patterns must follow the implementation of the `glob` package: https://www.npmjs.com/package/glob#glob-primer\n\nUse the `debug` option to print information about which files end up being deleted.",
      },
      {
        name: "disable",
        type: "boolean",
        fullDescription:
          "If this flag is `true`, any functionality related to source maps will be disabled.\n\nDefaults to `false`.",
      },
    ],
  },

  {
    name: "release",
    fullDescription:
      "Options related to managing the Sentry releases for a build.\n\nMore info: https://docs.sentry.io/product/releases/",
    children: [
      {
        name: "name",
        type: "string",
        fullDescription:
          "Unique identifier for the release you want to create.\n\nThis value can also be specified via the `SENTRY_RELEASE` environment variable.\n\nDefaults to automatically detecting a value for your environment. This includes values for Cordova, Heroku, AWS CodeBuild, CircleCI, Xcode, and Gradle, and otherwise uses the git `HEAD`'s commit SHA (the latter requires access to git CLI and for the root directory to be a valid repository).\n\nIf no `name` is provided and the plugin can't automatically detect one, no release will be created.",
      },
      {
        name: "inject",
        type: "boolean",
        fullDescription:
          "Whether the plugin should inject release information into the build for the SDK to pick it up when sending events. (recommended)\n\nDefaults to `true`.",
      },
      {
        name: "create",
        type: "boolean",
        fullDescription:
          "Whether the plugin should create a release on Sentry during the build.\n\nNote that a release may still appear in Sentry even if this is value is `false` because any Sentry event that has a release value attached will automatically create a release. (for example via the `inject` option)\n\nDefaults to `true`.",
      },
      {
        name: "finalize",
        type: "boolean",
        fullDescription:
          "Whether to automatically finalize the release. The release is finalized by adding an end timestamp after the build ends.\n\nDefaults to `true`.",
      },
      {
        name: "dist",
        type: "string",
        fullDescription:
          "Unique distribution identifier for the release. Used to further segment the release.\n\nUsually your build number.",
      },
      {
        name: "vcsRemote",
        type: "string",
        fullDescription:
          "Version control system (VCS) remote name.\n\nThis value can also be specified via the `SENTRY_VSC_REMOTE` environment variable.\n\nDefaults to 'origin'.",
      },
      {
        name: "setCommits",
        fullDescription:
          "Configuration for associating the release with its commits in Sentry.\n\nSet to `false` to disable commit association.\n\nDefaults to `{ auto: true }`.",
        children: [
          {
            name: "previousCommit",
            type: "string",
            fullDescription:
              "The commit before the beginning of this release (in other words, the last commit of the previous release).\n\nDefaults to the last commit of the previous release in Sentry.\n\nIf there was no previous release, the last 10 commits will be used.",
          },
          {
            name: "ignoreMissing",
            type: "boolean",
            fullDescription:
              "If the flag is to `true` and the previous release commit was not found in the repository, the plugin creates a release with the default commits count instead of failing the command.\n\nDefaults to `false`.",
          },
          {
            name: "ignoreEmpty",
            type: "boolean",
            fullDescription:
              "If this flag is set, the setCommits step will not fail and just exit silently if no new commits for a given release have been found.\n\nDefaults to `false`.",
          },
          {
            name: "auto",
            type: "boolean",
            fullDescription:
              "Automatically sets `commit` and `previousCommit`. Sets `commit` to `HEAD` and `previousCommit` as described in the option's documentation.\n\nIf you set this to `true`, manually specified `commit` and `previousCommit` options will be overridden. It is best to not specify them at all if you set this option to `true`.",
          },
          {
            name: "repo",
            type: "string",
            fullDescription:
              "The full repo name as defined in Sentry.\n\nRequired if the `auto` option is not set to `true`.",
          },
          {
            name: "commit",
            type: "string",
            fullDescription:
              "The current (last) commit in the release.\n\nRequired if the `auto` option is not set to `true`.",
          },
        ],
      },
      {
        name: "deploy",
        type: "DeployOptions | false",
        fullDescription:
          "Configuration for adding deployment information to the release in Sentry.\n\nSet to `false` to disable automatic deployment detection and creation (e.g., when deploying on Vercel).",
        children: [
          {
            name: "env",
            type: "string",
            fullDescription:
              "Environment for this release. Values that make sense here would be `production` or `staging`.",
          },
          {
            name: "started",
            type: "number | string",
            fullDescription:
              "Deployment start time in Unix timestamp (in seconds) or ISO 8601 format.",
          },
          {
            name: "finished",
            type: "number | string",
            fullDescription:
              "Deployment finish time in Unix timestamp (in seconds) or ISO 8601 format.",
          },
          {
            name: "time",
            type: "number",
            fullDescription:
              "Deployment duration (in seconds). Can be used instead of started and finished.",
          },
          {
            name: "name",
            type: "string",
            fullDescription: "Human readable name for the deployment.",
          },
          {
            name: "url",
            type: "string",
            fullDescription: "URL that points to the deployment.",
          },
        ],
      },
      {
        name: "cleanArtifacts",
        type: "boolean",
        fullDescription:
          "Remove all previously uploaded artifacts for this release on Sentry before the upload.\n\nDefaults to `false`.\n\n**Deprecation Notice:** `cleanArtifacts` is deprecated and will does currently not do anything. Historically it was needed since uploading the same artifacts twice was not allowed. Nowadays, when uploading artifacts with the same name more than once to the same release on Sentry, Sentry will prefer the most recent artifact for source mapping.",
      },
      {
        name: "uploadLegacySourcemaps",
        type: "string | IncludeEntry | Array<string | IncludeEntry>",
        fullDescription: `Legacy method of uploading source maps. (not recommended unless necessary)
One or more paths that should be scanned recursively for sources.

Each path can be given as a string or an object with more specific options.

The modern version of doing source maps upload is more robust and way easier to get working but has to inject a very small snippet of JavaScript into your output bundles.
In situations where this leads to problems (e.g subresource integrity) you can use this option as a fallback.

Please note that this option will not interact with any settings provided in the \`sourcemaps\` option. Using \`uploadLegacySourcemaps\` is a completely separate upload mechanism we provide for backwards-compatibility.

The \`IncludeEntry\` type looks as follows:

\`\`\`ts
type IncludeEntry = {
    /**
     * One or more paths to scan for files to upload.
     */
    paths: string[];

    /**
     * One or more paths to ignore during upload.
     * Overrides entries in ignoreFile file.
     *
     * Defaults to \`['node_modules']\` if neither \`ignoreFile\` nor \`ignore\` is set.
     */
    ignore?: string | string[];

    /**
     * Path to a file containing list of files/directories to ignore.
     *
     * Can point to \`.gitignore\` or anything with the same format.
     */
    ignoreFile?: string;

    /**
     * Array of file extensions of files to be collected for the file upload.
     *
     * By default the following file extensions are processed: js, map, jsbundle and bundle.
     */
    ext?: string[];

    /**
     * URL prefix to add to the beginning of all filenames.
     * Defaults to '~/' but you might want to set this to the full URL.
     *
     * This is also useful if your files are stored in a sub folder. eg: url-prefix '~/static/js'.
     */
    urlPrefix?: string;

    /**
     * URL suffix to add to the end of all filenames.
     * Useful for appending query parameters.
     */
    urlSuffix?: string;

    /**
     * When paired with the \`rewrite\` option, this will remove a prefix from filename references inside of
     * sourcemaps. For instance you can use this to remove a path that is build machine specific.
     * Note that this will NOT change the names of uploaded files.
     */
    stripPrefix?: string[];

    /**
     * When paired with the \`rewrite\` option, this will add \`~\` to the \`stripPrefix\` array.
     *
     * Defaults to \`false\`.
     */
    stripCommonPrefix?: boolean;

    /**
     * Determines whether sentry-cli should attempt to link minified files with their corresponding maps.
     * By default, it will match files and maps based on name, and add a Sourcemap header to each minified file
     * for which it finds a map. Can be disabled if all minified files contain sourceMappingURL.
     *
     * Defaults to true.
     */
    sourceMapReference?: boolean;

    /**
     * Enables rewriting of matching source maps so that indexed maps are flattened and missing sources
     * are inlined if possible.
     *
     * Defaults to true
     */
    rewrite?: boolean;

    /**
     * When \`true\`, attempts source map validation before upload if rewriting is not enabled.
     * It will spot a variety of issues with source maps and cancel the upload if any are found.
     *
     * Defaults to \`false\` as this can cause false positives.
     */
    validate?: boolean;
};
\`\`\`

`,
      },
    ],
  },
  {
    name: "bundleSizeOptimizations",
    fullDescription: `Options for bundle size optimizations by excluding certain features.`,
    children: [
      {
        name: "excludeDebugStatements",
        type: "boolean",
        fullDescription: `Exclude debug statements from the bundle, thus disabling features like the SDK's \`debug\` option.\n\nIf set to \`true\`, the plugin will attempt to tree-shake (remove) any debugging code within the Sentry SDK during the build.\nNote that the success of this depends on tree-shaking being enabled in your build tooling.\n\nDefaults to \`false\`.`,
      },
      {
        name: "excludeTracing",
        type: "boolean",
        fullDescription: `Exclude tracing functionality from the bundle, thus disabling features like performance monitoring.\n\nIf set to \`true\`, the plugin will attempt to tree-shake (remove) code within the Sentry SDK that is related to tracing and performance monitoring.\nNote that the success of this depends on tree-shaking being enabled in your build tooling.\n\n**Notice:** Do not enable this when you're using any performance monitoring-related SDK features (e.g. \`Sentry.startTransaction()\`).\n\nDefaults to \`false\`.`,
      },
      {
        name: "excludeReplayShadowDom",
        type: "boolean",
        fullDescription: `Exclude Replay Shadow DOM functionality from the bundle.\n\nIf set to \`true\`, the plugin will attempt to tree-shake (remove) code related to the Sentry SDK's Session Replay Shadow DOM recording functionality.\nNote that the success of this depends on tree-shaking being enabled in your build tooling.\n\nThis option is safe to be used when you do not want to capture any Shadow DOM activity via Sentry Session Replay.\n\nDefaults to \`false\`.`,
      },
      {
        name: "excludeReplayIframe",
        type: "boolean",
        fullDescription: `Exclude Replay iFrame functionality from the bundle.\n\nIf set to \`true\`, the plugin will attempt to tree-shake (remove) code related to the Sentry SDK's Session Replay \`iframe\` recording functionality.\nNote that the success of this depends on tree-shaking being enabled in your build tooling.\n\nYou can safely do this when you do not want to capture any \`iframe\` activity via Sentry Session Replay.\n\nDefaults to \`false\`.`,
      },
      {
        name: "excludeReplayWorker",
        type: "boolean",
        fullDescription: `Exclude Replay worker functionality from the bundle.\n\nIf set to \`true\`, the plugin will attempt to tree-shake (remove) code related to the Sentry SDK's Session Replay's Compression Web Worker.\nNote that the success of this depends on tree-shaking being enabled in your build tooling.\n\n**Notice:** You should only use this option if you manually host a compression worker and configure it in your Sentry Session Replay integration config via the \`workerUrl\` option.\n\nDefaults to \`false\`.`,
      },
    ],
  },
  {
    name: "reactComponentAnnotation",
    fullDescription: `(NOTICE: Use the react component annotation feature with caution. The option will pass additional properties to your React components which may lead to errors if libraries or your own code iterate through component props without checking for the additional Sentry props.)\n\nOptions related to react component name annotations.
      Disabled by default, unless a value is set for this option.\nWhen enabled, your app's DOM will automatically be annotated during build-time with their respective component names.\nThis will unlock the capability to search for Replays in Sentry by component name, as well as see component names in breadcrumbs and performance monitoring.`,
    supportedBundlers: ["webpack", "vite", "rollup"],
    children: [
      {
        name: "enabled",
        type: "boolean",
        fullDescription: "Whether the component name annotate plugin should be enabled or not.",
        supportedBundlers: ["webpack", "vite", "rollup"],
      },
      {
        name: "ignoredComponents",
        type: "string[]",
        fullDescription:
          "A list of strings representing the names of components to ignore. The plugin will not perform apply `data-sentry` annotations on the DOM element for these components.",
        supportedBundlers: ["webpack", "vite", "rollup"],
      },
      {
        name: "_experimentalInjectIntoHtml",
        type: "boolean",
        fullDescription:
          "An experimental component annotation injection mode that injects annotations into HTML rather than React components.",
        supportedBundlers: ["webpack", "vite", "rollup"],
      },
    ],
  },
  {
    name: "moduleMetadata",
    type: "Record<string, any> | (args: { org?: string; project?: string; release?: string; }) => Record<string, any>",
    fullDescription:
      "Metadata that should be associated with the built application.\n\nThe metadata is serialized and can be looked up at runtime from within the SDK (for example in the `beforeSend`, event processors, or the transport), allowing for custom event filtering logic or routing of events.\n\nMetadata can either be passed directly or alternatively a callback can be provided that will be called with the following parameters:\n\n- `org`: The organization slug.\n- `project`: The project slug.\n- `release`: The release name.",
  },
  {
    name: "applicationKey",
    type: "string",
    fullDescription:
      "A key which will embedded in all the bundled files. The SDK will be able to use the key to apply filtering rules, for example using the `thirdPartyErrorFilterIntegration`.",
  },
  {
    name: "_experiments",
    type: "string",
    fullDescription:
      "Options that are considered experimental and subject to change. This option does not follow semantic versioning and may change in any release.",
    children: [
      {
        name: "injectBuildInformation",
        type: "boolean",
        fullDescription:
          "If set to true, the plugin will inject an additional `SENTRY_BUILD_INFO` variable. This contains information about the build, e.g. dependencies, node version and other useful data.\n\nDefaults to `false`.",
      },
    ],
  },
];

function generateTableOfContents(
  depth: number,
  parentId: string,
  nodes: OptionDocumentation[],
  bundler: Bundler
): string {
  return nodes
    .map((node) => {
      if (node.supportedBundlers && !node.supportedBundlers?.includes(bundler)) {
        return "";
      }

      const id = `${parentId}-${node.name.toLowerCase()}`;
      let output = `${"    ".repeat(depth)}-   [\`${node.name}\`](#${id
        .replace(/-/g, "")
        .toLowerCase()})`;
      if (node.children && depth <= 0) {
        output += "\n";
        output += generateTableOfContents(depth + 1, id, node.children, bundler);
      }
      return output;
    })
    .join("\n");
}

function generateDescriptions(
  parentName: string | undefined,
  nodes: OptionDocumentation[],
  bundler: Bundler
): string {
  return nodes
    .map((node) => {
      if (node.supportedBundlers && !node.supportedBundlers?.includes(bundler)) {
        return "";
      }

      const name = parentName === undefined ? node.name : `${parentName}.${node.name}`;
      let output = `### \`${name}\`

${node.type === undefined ? "" : `Type: \`${node.type}\``}

${node.fullDescription}
`;
      if (node.children) {
        output += generateDescriptions(name, node.children, bundler);
      }
      return output;
    })
    .join("\n");
}

export function generateOptionsDocumentation(bundler: Bundler): string {
  return `## Options

${generateTableOfContents(0, "", options, bundler)}

${generateDescriptions(undefined, options, bundler)}
`;
}
