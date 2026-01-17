# Инструкция по деплою на GitHub

## Шаг 1: Создайте репозиторий на GitHub

1. Перейдите на https://github.com/new
2. Название репозитория: `owleys-scenario-builder`
3. Выберите "Public" или "Private"
4. НЕ создавайте README, .gitignore или лицензию (они уже есть)
5. Нажмите "Create repository"

## Шаг 2: Добавьте remote и запушьте код

```bash
git remote add origin https://github.com/YOUR_USERNAME/owleys-scenario-builder.git
git push -u origin main
```

Замените `YOUR_USERNAME` на ваш GitHub username.

## Альтернатива: Используйте SSH

Если вы настроили SSH ключи:

```bash
git remote add origin git@github.com:YOUR_USERNAME/owleys-scenario-builder.git
git push -u origin main
```

## Важно

- Не коммитьте `.env` файл (он уже в .gitignore)
- API ключи должны храниться в переменных окружения
- Для production используйте GitHub Actions или другой CI/CD


