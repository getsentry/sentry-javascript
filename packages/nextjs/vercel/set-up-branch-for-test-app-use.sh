# SCRIPT TO SET UP BRANCH FOR USE IN VERCEL-DEPLOYED TEST APPS

# CALL THIS WITH `yarn vercel:branch`

echo " "

NEXTJS_SDK_DIR=$(pwd)

# this puts us in the repo root
cd ../..

# make sure we're dealing with a clean SDK repo
STASHED_CHANGES=$(git status --porcelain)
if [ -n "${STASHED_CHANGES}" ]; then
  echo "Found uncommitted changes. Stashing them."
  git stash --quiet --include-untracked
fi

# if this hasn't already been done, get rid of irrelevant packages to speed up deploy process
PACKAGES_DELETED=false
for package in "angular" "ember" "eslint-config-sdk" "eslint-plugin-sdk" "gatsby" "serverless" "vue" "wasm"; do
  if [ -d packages/${package} ]; then
    echo "Deleting ${package}"
    rm -rf packages/${package}
    PACKAGES_DELETED=true
  fi
done

echo " "

# if we deleted anything, commit the result
if [ "$PACKAGES_DELETED" = true ]; then
  echo "Committing deletions. Don't forget to push this commit before you deploy."
  git add .
  git commit -m "delete unneeded packages"
else
  echo "Branch already set up for vercel deployment"
fi

# restore working directory, if necessary
if [ -n "${STASHED_CHANGES}" ]; then
  echo " "
  echo "Restoring changes from earlier stash:"
  git stash pop --quiet
  git status --porcelain
  echo " "
fi

cd $NEXTJS_SDK_DIR
