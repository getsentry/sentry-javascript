for filepath in ./src/*; do
  for js_version in "ES5" "ES6"; do

    file=$(basename $filepath)

    # the index file is only there for the purposes of npm builds - for the CDN we create a separate bundle for each
    # integration - so we can skip it here
    if [[ $file == "index.ts" ]]; then
      continue
    fi

    # run the build for each integration, pushing each build process into the background once it starts (that's what the
    # trailing `&` does) so that we can start another one
    echo -e "Building $js_version bundles for \`$file\`..."
    INTEGRATION_FILE=$file JS_VERSION=$js_version \
      yarn --silent rollup -c rollup.config.js &&
      echo -e "Finished building $js_version bundles for \`$file\`." &

  done
done

# keep the process running until all backgrounded tasks have finished
wait

echo -e "\nIntegration bundles built successfully"
