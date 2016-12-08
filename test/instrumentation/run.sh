# /bin/sh
version=`node -v`
version2=`echo $version | cut -c 2-`
folder="node-$version2"

if [ ! -d $folder ]; then
  url="https://codeload.github.com/nodejs/node/tar.gz/$version"
  curl $url -o "$version.tar.gz"
  tar -xvf "$version.tar.gz"
fi
node "node-http.test.js" `pwd`/$folder
