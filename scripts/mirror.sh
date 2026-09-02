#!/bin/bash
set -x
echo "FTP_HOST=$FTP_HOST"
echo "FTP_USER=$FTP_USER"
echo "FTP_PASS_LEN=${#FTP_PASS}"

cd dist
ls -la

find . -type f | sed 's|^\./||' | while read -r f; do
  echo "Uploading: $f"
  curl -v --ftp-pasv --retry 2 --ftp-create-dirs -T "$f" "ftp://$FTP_USER:$FTP_PASS@$FTP_HOST/$f" || {
    echo "FAILED: $f (exit $?)"
    exit 1
  }
done
echo "mirror to reg.ru done"
