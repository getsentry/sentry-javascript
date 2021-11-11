function link_package() {
  local package_abs_path=$1
  # strip the 'sentry-' prefix from the repo name of packages not in the monorepo (`cli`, `webpack-plugin`, and `wizard`)
  local package_name=$(basename $package_abs_path | sed s/sentry-//)

  echo "Setting up @sentry/${package_name} for linking"
  pushd $package_abs_path
  yarn link
  popd

  echo "Linking @sentry/$package_name"
  yarn link "@sentry/$package_name"

}

# Note: LINKED_CLI_REPO and LINKED_PLUGIN_REPO in the functions below should be set to the absolute path of each local repo

function linkcli() {
  if [[ ! $LINKED_CLI_REPO ]]; then
    return
  fi

  # check to make sure the repo directory exists
  if [[ -d $LINKED_CLI_REPO ]]; then
    link_package $LINKED_CLI_REPO
  else
    # the $1 lets us insert a string in that spot if one is passed to `linkcli` (useful for when we're calling this from
    # within another linking function)
    echo "ERROR: Can't link @sentry/cli $1because directory $LINKED_CLI_REPO does not exist."
  fi
}

function linkplugin() {
  if [[ ! $LINKED_PLUGIN_REPO ]]; then
    return
  fi

  # check to make sure the repo directory exists
  if [[ -d $LINKED_PLUGIN_REPO ]]; then
    link_package $LINKED_PLUGIN_REPO

    # the webpack plugin depends on `@sentry/cli`, so if we're also using a linked version of the cli package, the
    # plugin needs to link to it, too
    if [[ $LINKED_CLI_REPO ]]; then
      pushd $LINKED_PLUGIN_REPO
      link_cli "in webpack plugin repo "
      popd
    fi
  else
    echo "ERROR: Can't link @sentry/wepack-plugin because $LINKED_PLUGIN_REPO does not exist."
  fi
}

# This is only really useful for running tests in the debugger, as the normal test runner reinstalls all SDK packages
# from the local files on each test run
function link_monorepo_packages() {
  local repo_packages_dir=$1

  for abs_package_path in ${repo_packages_dir}/*; do
    local package_name=$(basename $abs_package_path)

    # Skip packages under the `@sentry-internal` namespace (our function is only linking packages in the `@sentry`
    # namespace, and besides, there's no reason to link such packages, as they're purely SDK dev dependencies).
    #
    # (The regex test ( `=~` ) is a sneaky way of testing if `package_name` is any of the three packages listed: if the
    # string containing all of the packages containes a match to the regex solely consisting of the current package
    # name, the current package must be in the list.)
    if [[ "eslint-config-sdk eslint-plugin-sdk typescript" =~ $package_name ]]; then
      continue
    fi

    # `-L` tests if the given file is a symbolic link, to see if linking has already been done
    if [[ ! -L node_modules/@sentry/$package_name ]]; then
      echo "Linking @sentry/$package_name"
      link_package $abs_package_path >/dev/null 2>&1
    fi

  done
}
