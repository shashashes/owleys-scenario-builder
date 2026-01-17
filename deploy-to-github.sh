#!/bin/bash

# Скрипт для автоматического деплоя на GitHub
# Использование: ./deploy-to-github.sh YOUR_USERNAME REPO_NAME

set -e

GITHUB_USERNAME=${1:-""}
REPO_NAME=${2:-"owleys-scenario-builder"}

if [ -z "$GITHUB_USERNAME" ]; then
  echo "❌ Ошибка: не указан GitHub username"
  echo "Использование: ./deploy-to-github.sh YOUR_USERNAME [REPO_NAME]"
  exit 1
fi

echo "🚀 Начинаю деплой на GitHub..."

# Проверяем, что мы в git репозитории
if [ ! -d ".git" ]; then
  echo "❌ Ошибка: это не git репозиторий"
  exit 1
fi

# Проверяем наличие изменений
if [ -n "$(git status --porcelain)" ]; then
  echo "⚠️  Есть незакоммиченные изменения. Добавляю их..."
  git add .
  git commit -m "Auto-commit before GitHub deployment"
fi

# Проверяем, есть ли уже remote
if git remote get-url origin >/dev/null 2>&1; then
  echo "✅ Remote origin уже настроен"
  REMOTE_URL=$(git remote get-url origin)
  echo "   URL: $REMOTE_URL"
else
  echo "📝 Создаю remote origin..."
  
  # Пробуем создать репозиторий через GitHub API (если есть токен)
  if [ -n "$GITHUB_TOKEN" ]; then
    echo "🔑 Используется GITHUB_TOKEN для создания репозитория..."
    
    # Создаем репозиторий через API
    CREATE_RESPONSE=$(curl -s -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      https://api.github.com/user/repos \
      -d "{\"name\":\"$REPO_NAME\",\"private\":false,\"description\":\"Owleys Scenario Builder - AI-powered scenario page generator\"}")
    
    if echo "$CREATE_RESPONSE" | grep -q '"id"'; then
      echo "✅ Репозиторий создан через API"
    elif echo "$CREATE_RESPONSE" | grep -q "already exists"; then
      echo "ℹ️  Репозиторий уже существует"
    else
      echo "⚠️  Не удалось создать репозиторий через API:"
      echo "$CREATE_RESPONSE" | head -5
      echo ""
      echo "Создайте репозиторий вручную на https://github.com/new"
      echo "Имя: $REPO_NAME"
      read -p "Нажмите Enter после создания репозитория..."
    fi
  else
    echo "⚠️  GITHUB_TOKEN не найден"
    echo "Создайте репозиторий вручную:"
    echo "1. Перейдите на https://github.com/new"
    echo "2. Имя репозитория: $REPO_NAME"
    echo "3. НЕ создавайте README, .gitignore или лицензию"
    read -p "Нажмите Enter после создания репозитория..."
  fi
  
  # Добавляем remote
  git remote add origin "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git" 2>/dev/null || \
  git remote set-url origin "https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
  echo "✅ Remote origin добавлен: https://github.com/$GITHUB_USERNAME/$REPO_NAME.git"
fi

# Пушим код
echo "📤 Отправляю код на GitHub..."
git push -u origin main || git push -u origin master

echo ""
echo "✅ Деплой завершен!"
echo "📦 Репозиторий: https://github.com/$GITHUB_USERNAME/$REPO_NAME"
echo ""
echo "Для обновления кода в будущем используйте:"
echo "  git add ."
echo "  git commit -m 'Your commit message'"
echo "  git push"


