# Как добавить изображения для items

## Способ 1: Локальные файлы (рекомендуется)

1. Поместите изображения в эту папку (`public/images/`)
2. В CSV файле (`public/data/items.csv`) в колонке **"BOX Picture"** укажите имя файла:
   - Например: `item-001.jpg` или `product-image.png`
   - Или полный путь: `./images/item-001.jpg`

## Способ 2: URL изображений

В CSV файле в колонке **"BOX Picture"** укажите полный URL:
- Например: `https://example.com/images/product.jpg`
- Или: `http://example.com/images/product.jpg`

## Примеры для CSV:

```
BOX Picture
item-001.jpg
https://cdn.example.com/products/item-002.jpg
./images/item-003.png
```

## Форматы изображений

Поддерживаются все форматы, которые поддерживает браузер:
- `.jpg`, `.jpeg`
- `.png`
- `.webp`
- `.gif`
- `.svg`

## Именование файлов

Рекомендуется использовать понятные имена:
- По SKU: `OUTR01-01A.jpg`
- По Item ID: `p-3014-10.jpg`
- По названию: `foldable-car-trunk-organizer-hexy.jpg`

## Примечание

Если изображение не найдено, будет показан placeholder с инициалами названия товара.

