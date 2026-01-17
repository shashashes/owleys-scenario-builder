#!/usr/bin/env node

/**
 * Скрипт для автоматического добавления путей к изображениям в CSV
 * 
 * Использование:
 * 1. Поместите изображения в public/images/
 * 2. Запустите: node scripts/add-images.js
 * 
 * Скрипт автоматически определит товар по имени файла используя:
 * - Точное совпадение по Item ID (приоритет 1)
 * - Точное совпадение по SKU (приоритет 2)
 * - Совпадение по ключевым словам из названия товара (приоритет 3)
 * - Частичное совпадение по Item ID или SKU (приоритет 4)
 * 
 * Примеры имен файлов:
 * - p-3014-10.jpg (по Item ID)
 * - OUTR01-01A.jpg (по SKU)
 * - hanging-car-trunk-organizer.jpg (по названию)
 * - hold-go.jpg (по ключевым словам)
 * - travel-buddy.jpg (по названию товара)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Papa from 'papaparse';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CSV_PATH = path.join(__dirname, '../public/data/items.csv');
const IMAGES_DIR = path.join(__dirname, '../public/images');

// Получаем список всех файлов изображений
function getImageFiles() {
  if (!fs.existsSync(IMAGES_DIR)) {
    console.log('⚠️  Папка images не найдена. Создаю...');
    fs.mkdirSync(IMAGES_DIR, { recursive: true });
    return [];
  }
  
  const files = fs.readdirSync(IMAGES_DIR);
  return files.filter(f => {
    const ext = path.extname(f).toLowerCase();
    return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext);
  });
}

// Нормализуем строку для сравнения (убираем спецсимволы, приводим к нижнему регистру)
function normalize(str) {
  return String(str || '')
    .toLowerCase()
    .replace(/["«»""'']/g, '') // убираем все виды кавычек
    .replace(/[^a-z0-9\s-]/g, '') // убираем спецсимволы кроме пробелов и дефисов
    .replace(/\s+/g, '-') // пробелы в дефисы
    .replace(/-+/g, '-') // множественные дефисы в один
    .replace(/(^-|-$)/g, ''); // убираем дефисы в начале и конце
}

// Извлекаем ключевые слова из строки (игнорируя цвета и общие слова)
function extractKeywords(str) {
  const normalized = normalize(str);
  // Убираем стоп-слова, цвета и общие слова
  const stopWords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 
    'old', 'owleys', 'car', 'black', 'white', 'gray', 'grey', 'brown', 'tan', 'beige', 'cream',
    'golden', 'eco', 'leather', 'by', 'mk', 'ii', 'pro'
  ]);
  return normalized
    .split('-')
    .filter(word => word.length > 2 && !stopWords.has(word));
}

// Извлекаем важные ключевые слова (название продукта, модель)
function extractImportantKeywords(str) {
  const normalized = normalize(str);
  // Ищем важные слова: названия моделей, типы продуктов
  const importantPatterns = [
    /(hanging|foldable|trunk|organizer)/gi,
    /(travel|buddy|hold|go|hexy|highway|magic|box)/gi,
    /(seat|protector|cover|mat|kick)/gi,
    /(dog|hammock|carrier)/gi,
    /(harlow|seashell|nomad|scorcher)/gi,
    /(crossclean|crossgun|vacuum|cleaner)/gi
  ];
  
  const found = [];
  importantPatterns.forEach(pattern => {
    const matches = normalized.match(pattern);
    if (matches) found.push(...matches.map(m => m.toLowerCase()));
  });
  
  return [...new Set(found)]; // убираем дубликаты
}

// Вычисляем схожесть между именем файла и названием товара
function calculateSimilarity(fileName, itemName) {
  const fileKeywords = extractKeywords(fileName);
  const itemKeywords = extractKeywords(itemName);
  const fileImportant = extractImportantKeywords(fileName);
  const itemImportant = extractImportantKeywords(itemName);
  
  if (fileKeywords.length === 0 || itemKeywords.length === 0) return 0;
  
  // Считаем совпадения важных ключевых слов (больший вес)
  const importantMatches = fileImportant.filter(fk => 
    itemImportant.some(ik => ik.includes(fk) || fk.includes(ik))
  ).length;
  
  // Считаем совпадения обычных ключевых слов
  const regularMatches = fileKeywords.filter(fk => 
    itemKeywords.some(ik => ik.includes(fk) || fk.includes(ik))
  ).length;
  
  // Если есть важные ключевые слова, даем им больший вес
  const importantWeight = fileImportant.length > 0 ? 0.6 : 0;
  const regularWeight = 1 - importantWeight;
  
  const importantScore = fileImportant.length > 0 
    ? importantMatches / Math.max(fileImportant.length, itemImportant.length)
    : 0;
  const regularScore = regularMatches / Math.max(fileKeywords.length, itemKeywords.length);
  
  return importantScore * importantWeight + regularScore * regularWeight;
}

// Пытаемся найти товар для изображения
function findItemForImage(imageFile, items) {
  const fileName = path.basename(imageFile, path.extname(imageFile));
  const normalizedFileName = normalize(fileName);
  
  let bestMatch = null;
  let bestScore = 0;
  
  items.forEach(item => {
    // Пропускаем пустые строки
    if (!item['Item ID'] || !item['Item ID'].trim()) return;
    
    let score = 0;
    
    // Вариант 1: точное совпадение по Item ID
    const itemId = String(item['Item ID']).trim();
    if (itemId && normalize(itemId) === normalizedFileName) {
      score = 1.0; // максимальный приоритет
    }
    
    // Вариант 2: точное совпадение по SKU
    if (score < 1.0 && item['Item (SKU Owleys)']) {
      const sku = String(item['Item (SKU Owleys)']).trim();
      const cleanSku = sku.replace(/\s*\([^)]*\)\s*/g, '').trim();
      if (cleanSku && normalize(cleanSku) === normalizedFileName) {
        score = 0.95;
      }
    }
    
    // Вариант 3: совпадение по названию товара (ключевые слова) - ПРИОРИТЕТ
    if (item['ITEM NAME'] || item['I T E M    N A M E']) {
      const itemName = String(item['ITEM NAME'] || item['I T E M    N A M E'] || '').trim();
      if (itemName) {
        const similarity = calculateSimilarity(fileName, itemName);
        // Снижаем пороги для лучшего сопоставления
        if (similarity > 0.3) { // минимум 30% совпадения (было 40%)
          score = Math.max(score, 0.5 + similarity * 0.4); // от 0.5 до 0.9
        } else if (similarity > 0.15) { // среднее совпадение (было 0.2)
          score = Math.max(score, 0.3 + similarity * 0.3); // от 0.3 до 0.5
        } else if (similarity > 0.1) { // слабое совпадение - тоже учитываем
          score = Math.max(score, 0.2 + similarity * 0.2); // от 0.2 до 0.3
        }
        
        // Дополнительная проверка: точное совпадение ключевых слов
        const itemNorm = normalize(itemName);
        const fileNorm = normalizedFileName;
        
        // Проверка размеров (17.7, 21.6, 21 inch)
        if ((itemNorm.includes('17') || itemNorm.includes('177')) && (fileNorm.includes('17') || fileNorm.includes('177'))) {
          score = Math.max(score, 0.25);
        }
        if ((itemNorm.includes('21') || itemNorm.includes('216')) && (fileNorm.includes('21') || fileNorm.includes('216'))) {
          score = Math.max(score, 0.25);
        }
        
        // Проверка цветов (black, gray, grey, white, golden, tan)
        const colors = ['black', 'gray', 'grey', 'white', 'golden', 'tan', 'beige'];
        for (const color of colors) {
          if (itemNorm.includes(color) && fileNorm.includes(color)) {
            score = Math.max(score, 0.2);
          }
        }
        
        // Проверка моделей (hexy, highway, harlow, travel buddy, quick kennel)
        const models = ['hexy', 'highway', 'harlow', 'travel', 'buddy', 'quick', 'kennel', 'pro'];
        for (const model of models) {
          if (itemNorm.includes(model) && fileNorm.includes(model)) {
            score = Math.max(score, 0.25);
          }
        }
      }
    }
    
    // Вариант 4: частичное совпадение по Item ID или SKU
    if (score < 0.3) {
      if (itemId && normalizedFileName.includes(normalize(itemId))) {
        score = 0.2;
      }
      if (item['Item (SKU Owleys)']) {
        const sku = String(item['Item (SKU Owleys)']).trim();
        const cleanSku = sku.replace(/\s*\([^)]*\)\s*/g, '').trim();
        if (cleanSku && normalizedFileName.includes(normalize(cleanSku))) {
          score = 0.2;
        }
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestMatch = item;
    }
  });
  
  // Возвращаем только если уверенность достаточно высока
  // Снижаем пороги для лучшего сопоставления: для совпадения по названию требуем минимум 20%, для ID/SKU - 15%
  const minScore = bestMatch && bestScore >= 0.5 ? 0.2 : 0.15;
  return bestScore >= minScore ? { item: bestMatch, score: bestScore } : null;
}

// Основная функция
function main() {
  console.log('🖼️  Добавление изображений в CSV...\n');
  
  // Читаем CSV (новый файл использует разделитель ';')
  const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
  const parsed = Papa.parse(csvContent, { 
    header: true, 
    skipEmptyLines: false,
    delimiter: ';'  // Явно указываем разделитель
  });
  
  // Получаем список изображений
  const imageFiles = getImageFiles();
  console.log(`📁 Найдено изображений: ${imageFiles.length}`);
  
  if (imageFiles.length === 0) {
    console.log('\n💡 Поместите изображения в папку public/images/');
    console.log('   Скрипт автоматически определит товар по имени файла:');
    console.log('   - По Item ID: p-3014-10.jpg');
    console.log('   - По SKU: OUTR01-01A.jpg');
    console.log('   - По названию: hanging-car-trunk-organizer.jpg');
    console.log('   - По ключевым словам: travel-buddy.jpg\n');
    return;
  }
  
  // Создаем мапу: Item ID -> строка CSV (для быстрого доступа)
  const itemMap = new Map();
  parsed.data.forEach((row, index) => {
    if (row['Item ID'] && row['Item ID'].trim()) {
      itemMap.set(row['Item ID'].trim(), index);
    }
  });
  
  // Для каждого изображения ищем соответствующий товар
  let updated = 0;
  const matchedImages = new Set(); // чтобы не перезаписывать уже найденные
  
  imageFiles.forEach(imageFile => {
    const match = findItemForImage(imageFile, parsed.data);
    
    if (match && match.item) {
      const itemId = match.item['Item ID'].trim();
      const rowIndex = itemMap.get(itemId);
      
      if (rowIndex !== undefined) {
        const row = parsed.data[rowIndex];
        
        // Пропускаем только если уже есть изображение И оно не пустое И мы уже сопоставили этот товар в этом запуске
        // Но если изображение пустое или не найдено, обновляем
        if (row['BOX Picture'] && row['BOX Picture'].trim() && matchedImages.has(itemId)) {
          console.log(`⚠ ${itemId} уже имеет изображение: ${row['BOX Picture']}`);
          return;
        }
        
        row['BOX Picture'] = imageFile;
        matchedImages.add(itemId);
        updated++;
        
        const itemName = row['ITEM NAME'] || row['I T E M    N A M E'] || 'Unknown';
        const confidence = (match.score * 100).toFixed(0);
        console.log(`✓ [${confidence}%] ${itemId} "${itemName.substring(0, 50)}" -> ${imageFile}`);
      }
    } else {
      console.log(`❓ Не найден товар для: ${imageFile}`);
    }
  });
  
  // Сохраняем обновленный CSV (используем разделитель ';')
  const updatedCsv = Papa.unparse(parsed.data, {
    header: true,
    columns: parsed.meta.fields,
    delimiter: ';'  // Сохраняем с тем же разделителем
  });
  
  fs.writeFileSync(CSV_PATH, updatedCsv, 'utf-8');
  
  console.log(`\n✅ Обновлено записей: ${updated}`);
  console.log(`📝 CSV сохранен: ${CSV_PATH}\n`);
}

main();

