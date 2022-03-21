for filepath in ./src/*; do
  for js_version in "ES5" "ES6"; do

    file=$(basename $filepath)

    # the index file is only there for the purposes of npm builds - for the CDN we create a separate bundle for each
    # integration - so we can skip it here
    if [[ $file == "index.ts" ]]; then
      continue
    fi

    # run the build for each integration
    INTEGRATION_FILE=$file JS_VERSION=$js_version yarn --silent rollup -c rollup.config.js

  done
done

echo -e "\nIntegration bundles built successfully"
