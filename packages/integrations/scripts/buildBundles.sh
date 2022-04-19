for filepath in ./src/*; do
  for js_version in "ES5" "ES6"; do

    file=$(basename $filepath)

    # The index file is only there for the purposes of npm builds (for the CDN we create a separate bundle for each
    # integration) and the flags file is just a helper for including or not including debug logging, whose contents gets
    # incorporated into each of the individual integration bundles, so we can skip them both here.
    if [[ $file == "index.ts" || $file == "flags.ts" ]]; then
      continue
    fi

    # run the build for each integration
    INTEGRATION_FILE=$file JS_VERSION=$js_version yarn --silent rollup --config rollup.bundle.config.js

  done
done

echo -e "\nIntegration bundles built successfully"
