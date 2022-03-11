for filepath in ./src/*; do
  file=$(basename $filepath)

  # the index file is only there for the purposes of npm builds - for the CDN we create a separate bundle for each
  # integration - so we can skip it here
  if [[ $file == "index.ts" ]]; then
    continue
  fi

  # run the build for each integration, pushing each build process into the background once it starts (that's what the
  # trailing `&` does) so that we can start another one
  echo -e "\nBuilding bundles for \`$file\`..."
  INTEGRATION_FILE=$file yarn --silent rollup -c rollup.config.js 2>/dev/null && echo -e "\nFinished building bundles for \`$file\`." &

done

# keep the process running until all backgrounded tasks have finished
wait

echo "Integration bundles built successfully"
