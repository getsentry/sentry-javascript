# SCRIPT TO INCLUDE AS PART OF A VERCEL-DEPLOYED PROJECT, FOR WORK TO BE DONE AFTER THE NEXTJS APP IS BUILT
# USE `yarn vercel:project <path-to-project>` TO HAVE IT AUTOMATICALLY ADDED TO YOUR PROJECT

# CUSTOM BUILD COMMAND FOR PROJECT ON VERCEL: `yarn build && bash .sentry/post-app-build.sh`

if [[ -e .next/analyze/ ]]; then
  echo " "
  echo "Moving bundle analysis graphs from \`.next/analyze/\` to \`/public\`"
  mv .next/analyze/* public
fi
if [[ -e .next/server/analyze/ ]]; then
  echo " "
  echo "Moving bundle analysis graphs from \`.next/server/analyze/\` to \`/public\`"
  mv .next/server/analyze/* public
  echo " "
fi
