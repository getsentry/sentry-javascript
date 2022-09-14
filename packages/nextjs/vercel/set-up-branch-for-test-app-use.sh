# SCRIPT TO SET UP BRANCH FOR USE IN VERCEL-DEPLOYED TEST APPS

# CALL THIS WITH `yarn vercel:branch`

echo " "

# This puts us in the packages directory
cd ..

# Make sure we're dealing with a clean SDK repo
STASHED_CHANGES=$(git status --porcelain)
if [ -n "${STASHED_CHANGES}" ]; then
  echo "Found uncommitted changes. Stashing them."
  git stash --quiet --include-untracked
fi

# If this hasn't already been done, get rid of irrelevant packages to speed up deploy process
PACKAGES_DELETED=false
for package in *; do
  # Delete all packages which aren't either runtime or dev dependencies of the nextjs SDK
  case $package in
  # Runtime depependencies
  "nextjs" | "core" | "hub" | "browser" | "node" | "react" | "tracing" | "utils" | "integrations")
    continue
    ;;
    # Dev dependencies
  "eslint-config-sdk" | "eslint-plugin-sdk" | "types" | "typescript")
    continue
    ;;
    # Everything else
  *)
    echo "Deleting ${package}"
    rm -rf ${package}
    PACKAGES_DELETED=true
    ;;
  esac
done

echo " "

# If we deleted anything, commit the result
if [ "$PACKAGES_DELETED" = true ]; then
  echo "Committing deletions. Don't forget to push this commit before you deploy."
  git add .
  git commit -m "delete unneeded packages"
else
  echo "Branch already set up for vercel deployment"
fi

# Restore working directory, if necessary
if [ -n "${STASHED_CHANGES}" ]; then
  echo " "
  echo "Restoring changes from earlier stash:"
  git stash pop --quiet
  git status --porcelain
  echo " "
fi

cd nextjs
