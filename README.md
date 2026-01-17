# Owleys Scenario Builder (MVP)

Мини-приложение: слева список товаров (из CSV), справа — сборка сценарных комбо (мульти-SKU).

## Запуск локально
```bash
npm i
npm run dev
```

## Деплой на GitHub Pages
1) Создай репозиторий на GitHub (например `owleys-scenario-builder`)
2) Залей содержимое этой папки в репо, ветка `main`
3) В GitHub → Settings → Pages:
   - Source: **GitHub Actions**
4) Сделай пуш в `main` — Action сам соберёт и задеплоит сайт.

> Если сайт открывается без данных: проверь, что `public/data/items.csv` на месте.

## Где лежат данные склада
`public/data/items.csv`

Можно обновлять файл и пушить — сайт пересоберётся.
