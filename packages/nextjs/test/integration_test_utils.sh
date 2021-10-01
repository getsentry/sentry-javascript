function link_package() {
  local package_abs_path=$1
  local package_name=$2

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
    link_package $LINKED_CLI_REPO "cli"
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
    link_package $LINKED_PLUGIN_REPO "webpack-plugin"

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
