#!/bin/bash
set -e

echo "=== Starting mirror to FTP ==="
cd dist

# Функция загрузки с подробной диагностикой
upload_file() {
  local file="$1"
  local size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0")
  echo "Uploading: $file (${size} bytes)"
  
  # Попытка 1: стандартная загрузка
  if curl -v --ftp-pasv --retry 5 --retry-delay 3 --retry-max-time 120 \
    --connect-timeout 30 --max-time 300 \
    --ftp-create-dirs \
    --user "$FTP_USER:$FTP_PASS" \
    -T "$file" \
    "ftp://$FTP_HOST/$file" 2>&1; then
    echo "✓ Success: $file"
    return 0
  else
    local exit_code=$?
    echo "✗ FAILED: $file (curl exit code: $exit_code)"
    echo "Retrying with active FTP mode..."
    
    # Попытка 2: активный режим вместо пассивного
    if curl -v --ftp-port --retry 3 --retry-delay 5 \
      --connect-timeout 30 --max-time 300 \
      --ftp-create-dirs \
      --user "$FTP_USER:$FTP_PASS" \
      -T "$file" \
      "ftp://$FTP_HOST/$file" 2>&1; then
      echo "✓ Success (active mode): $file"
      return 0
    else
      echo "✗ FAILED both modes: $file"
      return 1
    fi
  fi
}

# Загружаем все файлы кроме скрытых и пустых
failed=0
find . -type f ! -name '.*' ! -size 0 | sed 's|^\./||' | sort | while read -r f; do
  if ! upload_file "$f"; then
    echo "CRITICAL: Failed to upload $f"
    failed=1
    break
  fi
done

if [ "$failed" -eq 1 ]; then
  echo "=== Mirror FAILED ==="
  exit 1
else
  echo "=== Mirror completed successfully ==="
fi
