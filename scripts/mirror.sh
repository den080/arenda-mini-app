#!/bin/bash
set -e
set -x
echo "FTP_HOST=$FTP_HOST"
echo "FTP_USER=$FTP_USER"
echo "FTP_PASS_LEN=${#FTP_PASS}"
cd dist
find . -type f | sed 's|^\./||' | while read -r f; do
  echo "Uploading: $f"
  curl -s --ftp-pasv --retry 2 --ftp-create-dirs --user "$FTP_USER:$FTP_PASS" -T "$f" "ftp://$FTP_HOST/$f" || { echo "FAILED: $f (exit $?)"; exit 1; }
done
echo "mirror to reg.ru done"
