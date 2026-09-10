#!/bin/bash
set -e

echo "=== Starting mirror to FTP ==="
cd dist

upload_file() {
  local file="$1"
  local size=$(wc -c < "$file" 2>/dev/null || echo "0")
  echo "Uploading: $file (${size} bytes)"
  
  # Попытка 1: пассивный режим, увеличенные таймауты
  if curl -v --ftp-pasv --ftp-skip-pasv-ip \
    --retry 5 --retry-delay 3 --retry-max-time 300 \
    --retry-all-errors \
    --connect-timeout 60 --max-time 600 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file" 2>&1; then
    echo "✓ Success (pasv): $file"
    return 0
  fi
  
  echo "⚠ Pasv failed, trying active mode..."
  
  # Попытка 2: активный режим
  if curl -v --ftp-port \
    --retry 3 --retry-delay 5 --retry-max-time 300 \
    --retry-all-errors \
    --connect-timeout 60 --max-time 600 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file" 2>&1; then
    echo "✓ Success (active): $file"
    return 0
  fi
  
  echo "⚠ Active failed, trying explicit port 20..."
  
  # Попытка 3: явный порт данных 20
  if curl -v --ftp-port :20 \
    --retry 2 --retry-delay 5 --retry-max-time 300 \
    --connect-timeout 60 --max-time 600 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file" 2>&1; then
    echo "✓ Success (port 20): $file"
    return 0
  fi
  
  echo "✗ FAILED all modes: $file"
  return 1
}

# Загружаем сначала маленькие файлы, потом большие
{
  find . -type f ! -name '.*' ! -size 0 -size -100k | sed 's|^\./||' | sort
  find . -type f ! -name '.*' ! -size 0 -size +100k | sed 's|^\./||' | sort
} | while read -r f; do
  if ! upload_file "$f"; then
    echo "=== Mirror FAILED ==="
    exit 1
  fi
done

echo "=== Mirror completed successfully ==="
