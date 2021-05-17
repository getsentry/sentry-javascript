# meant to be run from sentry-javascript/packages/nextjs (none of the relative paths work otherwise)
# (note: this is primarily useful for CI - anyone working locally should theoretically only have to run it once)

function link_SDK() {
  local current_dir=$(pwd)
  echo "current dir is ${current_dir}"
  cd ../../../../..
  local repo_root=$(pwd)
  echo "repo root is ${repo_root}"

  # if the SDK isn't already set up for linking, do so now
  echo "Ensuring SDK is linkable"
  yarn link:yarn

  # link the SDK into the test app
  cd ${current_dir}

  for abs_package_path in ${repo_root}/packages/*; do
    local package_name=$(basename $abs_package_path)
    if [[ "$package_name" == "eslint-config-sdk" || "$package_name" == "eslint-plugin-sdk" || "$package_name" == "typescript" ]]; then
      continue
    fi
    echo "Linking @sentry/$package_name"
    yarn link "@sentry/$package_name"
  done

  echo "WARNING: @sentry/cli, @sentry/webpack-plugin, and @sentry/wizard not linked. (This is how it should be. If you want to test local copies, you must link them yourself.)"

}

export NODE_ENV="production"
cd test/integration/test-app
yarn --prod false
link_SDK
yarn build
