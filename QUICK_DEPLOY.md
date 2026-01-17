# 🚀 Быстрый деплой на GitHub

## Автоматический деплой (одна команда)

```bash
./deploy-to-github.sh YOUR_GITHUB_USERNAME
```

Замените `YOUR_GITHUB_USERNAME` на ваш GitHub username.

Скрипт:
1. ✅ Проверит git репозиторий
2. ✅ Создаст репозиторий на GitHub (если есть GITHUB_TOKEN)
3. ✅ Добавит remote origin
4. ✅ Отправит код на GitHub

## Ручной деплой (3 шага)

### 1. Создайте репозиторий
Перейдите на https://github.com/new и создайте репозиторий:
- **Имя:** `owleys-scenario-builder`
- **Public** или **Private** (на ваш выбор)
- **НЕ** создавайте README, .gitignore или лицензию

### 2. Добавьте remote и запушьте
```bash
git remote add origin https://github.com/YOUR_USERNAME/owleys-scenario-builder.git
git push -u origin main
```

### 3. Готово! 🎉
Ваш код теперь на GitHub: https://github.com/YOUR_USERNAME/owleys-scenario-builder

## С GitHub CLI (если установлен)

```bash
gh repo create owleys-scenario-builder --public --source=. --remote=origin --push
```


