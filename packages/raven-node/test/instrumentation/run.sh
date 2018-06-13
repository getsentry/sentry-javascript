# /bin/bash
version=`node -v`
versionMinusV=`echo $version | cut -c 2-`
nodeRoot="node-$versionMinusV"

if [ ! -d $nodeRoot ]; then
  url="https://codeload.github.com/nodejs/node/tar.gz/$version"
  curl $url -o "$version.tar.gz"
  tar -xf "$version.tar.gz"
  rm "$version.tar.gz"
fi
exec node http.test.js `pwd`/$nodeRoot
