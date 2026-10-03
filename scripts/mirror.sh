#!/bin/bash
set -e

# Зеркало на reg.ru ВРЕМЕННО ОТКЛЮЧЕНО (хостинг остановлен за неуплату).
# Чтобы включить снова: задать в Vercel → Settings → Environment Variables
# переменную MIRROR_ENABLED = 1 (и FTP_USER, FTP_PASS, FTP_HOST).
if [ "${MIRROR_ENABLED:-0}" != "1" ]; then
  echo "mirror to reg.ru skipped (MIRROR_ENABLED != 1)"
  exit 0
fi

cd dist
find . -type f ! -name '.gitkeep' ! -name '.DS_Store' ! -name 'telegram-web-app.js' | sed 's|^\./||' | while read -r f; do
  curl -s --ftp-pasv --retry 2 --ftp-create-dirs --user "$FTP_USER:$FTP_PASS" -T "$f" "ftp://$FTP_HOST/$f" || { echo "FAILED: $f"; exit 1; }
done
echo "mirror to reg.ru done"
