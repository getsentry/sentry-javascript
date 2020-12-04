# running compatibilty tests takes ~15 min on a 2019 2.6 GHz 6-Core Intel i7 16" MacBook Pro w 32 GB of RAM, vs ~25 sec
# for the regular tests

if [[ $TRAVIS || $GITHUB_ACTIONS ]]; then
  echo "In CI - running tests against multiple versions of Ember"
  yarn npm-run-all lint:* test:*
else
  echo "Tests running locally - will only run tests against default version of Ember"
  yarn npm-run-all lint:* test:ember
fi
