import React, { useEffect, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'

const LS_KEY = 'owleys_scenario_builder_v2'

function normHeader(h='') {
  const trimmed = String(h).trim()
  // Специальная обработка для заголовка "I T E M    N A M E" (с пробелами между буквами)
  // Проверяем точное совпадение или вариант с разным количеством пробелов
  if (trimmed === 'I T E M    N A M E' || /^I\s+T\s+E\s+M\s+N\s+A\s+M\s+E$/i.test(trimmed.replace(/\s{2,}/g, ' '))) {
    return 'ITEM NAME'
  }
  return trimmed.replace(/\s+/g, ' ')
}

function slug(s='') {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,'')
}

function safeNum(x) {
  const s = String(x).trim()
  if (!s) return null  // Пустая строка -> null
  const n = Number(s.replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function download(filename, content, mime='application/json') {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([content], { type: mime }))
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 800)
}

function escapeCsv(v) {
  const s = String(v ?? '')
  if (/[",\n]/.test(s)) return '"' + s.replaceAll('"','""') + '"'
  return s
}

function makeId(row) {
  const sku = row.sku || ''
  const id = row.itemId || sku || row.name || Math.random().toString(16).slice(2)
  return slug(id) || Math.random().toString(16).slice(2)
}

function parseItems(rawRows) {
  // Remove the weird timer/date rows if present
  const rows = rawRows
    .map(r => {
      const obj = {}
      for (const k of Object.keys(r)) obj[normHeader(k)] = r[k]
      return obj
    })
    .filter(r => {
      const sku = String(r['Item (SKU Owleys)'] ?? '')
      return !( /^\d{1,2}\/\d{1,2}\/\d{4}/.test(sku) )
    })

  return rows.map(r => {
    // После normHeader заголовок "I T E M    N A M E" становится "ITEM NAME"
    // Проверяем оба варианта на случай проблем с нормализацией
    const itemName = r['ITEM NAME'] ?? r['I T E M    N A M E'] ?? ''
    const finalName = String(itemName).trim()
    return {
    itemId: String(r['Item ID'] ?? '').trim(),
    pageId: String(r['Page ID'] ?? '').trim(),
      name: finalName,
    stock: safeNum(r['Stock']),
    type: String(r['Type'] ?? '').trim(),
    status: String(r['Status'] ?? '').trim(),
    sku: String(r['Item (SKU Owleys)'] ?? '').trim(),
    asin: String(r['ASIN'] ?? '').trim(),
    cogs: safeNum(r['Себестоимость']),
    image: String(r['BOX Picture'] ?? '').trim(), // often empty; you can later replace with real URLs
    }
  }).map(it => ({ ...it, id: makeId(it) }))
}

function placeholderThumb(name='') {
  const t = (name || 'Owleys').trim()
  const words = t.split(/\s+/).slice(0,2)
  const letters = words.map(w => w[0]).join('').toUpperCase()
  return letters || 'O'
}

function getImageSrc(imagePath) {
  if (!imagePath) return null
  const path = String(imagePath).trim()
  if (!path) return null
  
  // If it's a full URL (http:// or https://), use it as-is
  if (/^https?:\/\//.test(path)) {
    return path
  }
  
  // If it's a relative path, make sure it starts with ./
  // or if it starts with /, use it as-is
  // Otherwise, assume it's relative to public folder
  if (path.startsWith('/')) {
    return path
  }
  if (path.startsWith('./')) {
    return path
  }
  // If it doesn't start with / or ./, assume it's in the images folder
  // Кодируем имя файла для URL (особенно важно для пробелов и специальных символов)
  const fileName = path.split('/').pop() // берем только имя файла
  const encodedFileName = encodeURIComponent(fileName)
  const pathWithoutFile = path.substring(0, path.length - fileName.length)
  return `./images/${pathWithoutFile}${encodedFileName}`
}

// Извлекает название товара из имени файла изображения
function getNameFromImage(imagePath) {
  if (!imagePath) return null
  
  // Получаем имя файла (без пути)
  const fileName = String(imagePath)
    .split('/').pop() // берем последнюю часть пути
    .split('\\').pop() // для Windows путей
    .replace(/\.[^.]+$/, '') // убираем расширение
  
  if (!fileName) return null
  
  // Заменяем подчеркивания и множественные дефисы на пробелы
  // Но сохраняем кавычки и другие символы для читаемости
  return fileName
    .replace(/_/g, ' ') // подчеркивания в пробелы
    .replace(/\s*-\s*/g, ' ') // дефисы в пробелы
    .replace(/\s+/g, ' ') // множественные пробелы в один
    .trim()
}

function classNames(...xs) { return xs.filter(Boolean).join(' ') }

export default function App() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [showJTBDModal, setShowJTBDModal] = useState(false)
  const [newScenarioId, setNewScenarioId] = useState(null)
  const [jtbdPrompt, setJtbdPrompt] = useState('')
  const [loadingJTBD, setLoadingJTBD] = useState(false)

  const [scenarios, setScenarios] = useState(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (!saved) return [{ id: crypto.randomUUID(), name: 'New Scenario', items: [] }]
    try {
      const parsed = JSON.parse(saved)
      return parsed.scenarios?.length ? parsed.scenarios : [{ id: crypto.randomUUID(), name: 'New Scenario', items: [] }]
    } catch {
      return [{ id: crypto.randomUUID(), name: 'New Scenario', items: [] }]
    }
  })
  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem(LS_KEY)
    if (!saved) return null
    try { return JSON.parse(saved).activeId ?? null } catch { return null }
  })

  const activeScenario = useMemo(() => {
    const s = scenarios.find(s => s.id === activeId) || scenarios[0]
    return s
  }, [scenarios, activeId])

  useEffect(() => {
    if (!activeId && scenarios[0]) setActiveId(scenarios[0].id)
  }, [activeId, scenarios])

  useEffect(() => {
    localStorage.setItem(LS_KEY, JSON.stringify({ scenarios, activeId }))
  }, [scenarios, activeId])

  useEffect(() => {
    // load CSV from public folder
    setLoading(true)
    fetch('./data/items.csv')
      .then(r => r.text())
      .then(text => {
        // Файл использует точку с запятой как разделитель
        const res = Papa.parse(text, { 
          header: true, 
          skipEmptyLines: true,
          delimiter: ';'  // Явно указываем разделитель
        })
        const parsed = parseItems(res.data || [])
        setItems(parsed)
      })
      .catch(err => {
        console.error(err)
        setItems([])
      })
      .finally(() => setLoading(false))
  }, [])

  const types = useMemo(() => {
    const s = new Set(items.map(i => i.type).filter(Boolean))
    return Array.from(s).sort((a,b)=>a.localeCompare(b))
  }, [items])

  const statuses = useMemo(() => {
    const s = new Set(items.map(i => i.status).filter(Boolean))
    return Array.from(s).sort((a,b)=>a.localeCompare(b))
  }, [items])

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return items.filter(i => {
      // По умолчанию показываем только товары "in stock" (независимо от регистра), если не выбран другой фильтр по статусу
      if (!statusFilter && i.status?.toLowerCase() !== 'in stock') return false
      if (statusFilter && i.status !== statusFilter) return false
      if (typeFilter && i.type !== typeFilter) return false
      if (!qq) return true
      const hay = [i.name, i.sku, i.asin, i.type, i.status, i.itemId].join(' ').toLowerCase()
      return hay.includes(qq)
    })
  }, [items, q, typeFilter, statusFilter])

  function onDragStart(e, id) {
    e.dataTransfer.setData('text/plain', id)
  }

  function addToScenario(itemId) {
    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenario.id) return s
      const existing = s.items.find(x => x.itemId === itemId)
      const nextItems = existing
        ? s.items.map(x => x.itemId === itemId ? { ...x, qty: x.qty + 1 } : x)
        : [...s.items, { itemId, qty: 1 }]
      return { ...s, items: nextItems }
    }))
  }

  function removeFromScenario(itemId) {
    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenario.id) return s
      return { ...s, items: s.items.filter(x => x.itemId !== itemId) }
    }))
  }

  function setQty(itemId, qty) {
    const q = Math.max(1, Number(qty || 1))
    setScenarios(prev => prev.map(s => {
      if (s.id !== activeScenario.id) return s
      return { ...s, items: s.items.map(x => x.itemId === itemId ? { ...x, qty: q } : x) }
    }))
  }

  function renameScenario(name) {
    setScenarios(prev => prev.map(s => s.id === activeScenario.id ? { ...s, name } : s))
  }

  async function fetchScenarios(inventory, constraints) {
    // Используем относительный путь для Vercel serverless функции
    // В development это будет проксироваться через Vite, в production - через Vercel
    const apiUrl = import.meta.env.DEV 
      ? "http://localhost:8787/api/scenarios"  // Development: локальный сервер
      : "/api/scenarios"  // Production: Vercel serverless функция
    console.log('fetchScenarios: calling', apiUrl, 'with inventory:', inventory)
    try {
      const r = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ inventory, constraints })
      });
      console.log('fetchScenarios: response status', r.status, r.statusText)
      if (!r.ok) {
        const errorText = await r.text()
        console.error('fetchScenarios: error response', errorText)
        throw new Error(`Server error (${r.status}): ${errorText}`)
      }
      const data = await r.json()
      console.log('fetchScenarios: success', data)
      return data
    } catch (error) {
      console.error('fetchScenarios: fetch error', error)
      throw error
    }
  }

  async function generateJTBDWithAI(scenario, scenarioItems) {
    // Используем только локальный Express-сервер
    try {
      // Подготавливаем inventory для сервера
      const inventory = scenarioItems.map(item => ({
        title: item.name || '',
        qty: item.qty || 1,
        category: item.type || ''
      }))
      
      // Запрашиваем 1 сценарий (используется только первый результат)
      const constraints = { n: 1 }
      const result = await fetchScenarios(inventory, constraints)
      
      // Преобразуем JSON-ответ сервера в текстовый формат для отображения
      if (result.scenarios && result.scenarios.length > 0) {
        const s = result.scenarios[0]
        let text = ''
        
        // Название сценария остается на английском (scenario_name) - единственное, что на английском
        text += `**${s.scenario_name || 'Scenario'}**\n\n`
        // Tagline переводим на русский (но пока оставляем как есть - модель должна возвращать на русском)
        if (s.tagline) text += `${s.tagline}\n\n`
        
        if (s.gallery_frames && s.gallery_frames.length > 0) {
          text += `**ИДЕИ ДЛЯ ГАЛЕРЕИ СТОРИТЕЛЛИНГА:**\n`
          s.gallery_frames.forEach(frame => {
            // scene должен быть на русском (модель должна возвращать на русском)
            text += `Кадр ${frame.frame}: ${frame.scene}\n`
          })
          text += '\n'
        }
        
        if (s.products && s.products.length > 0) {
          text += `**ТОВАРЫ В ЭТОЙ СИСТЕМЕ:**\n`
          s.products.forEach(product => {
            // product.title остается на английском (название товара)
            // Сопоставляем product.title с реальными товарами, чтобы использовать полные названия
            let productTitle = product.title || ''
            const matchedItem = items.find(item => {
              // Проверяем по полному названию
              if (item.name && item.name.toLowerCase() === productTitle.toLowerCase()) {
                return true
              }
              // Проверяем по SKU
              if (item.sku && item.sku.toLowerCase() === productTitle.toLowerCase()) {
                return true
              }
              // Проверяем по частичному совпадению
              if (item.name && productTitle && item.name.toLowerCase().includes(productTitle.toLowerCase())) {
                return true
              }
              if (productTitle && item.name && productTitle.toLowerCase().includes(item.name.toLowerCase())) {
                return true
              }
              return false
            })
            
            // Используем полное название товара (на английском), если нашли совпадение
            const displayTitle = matchedItem ? matchedItem.name : productTitle
            // product.role должен быть на русском (модель должна возвращать на русском)
            text += `${displayTitle} — ${product.role}\n`
          })
          text += '\n'
        }
        
        if (s.page_blocks && s.page_blocks.length > 0) {
          text += `**ИДЕИ ДЛЯ КОНТЕНТНЫХ БЛОКОВ НА СТРАНИЦЕ:**\n`
          s.page_blocks.forEach(block => {
            // block.title и block.content должны быть на русском (модель должна возвращать на русском)
            text += `Блок ${block.block}: ${block.title} — ${block.content}\n`
          })
          text += '\n'
        }
        
        if (s.who_this_is_for) {
          text += `**ДЛЯ КОГО ЭТОТ СЦЕНАРИЙ:**\n`
          // Все поля who_this_is_for должны быть на русском (модель должна возвращать на русском)
          text += `Основная аудитория: ${s.who_this_is_for.primary_audience || ''}\n`
          text += `Вторичная аудитория: ${s.who_this_is_for.secondary_audience || ''}\n`
          text += `Триггерный момент: ${s.who_this_is_for.trigger_moment || ''}\n`
        }
        
        return text
      }
      
      return 'Ошибка: сервер вернул пустой ответ'
    } catch (error) {
      console.error('Error calling server API:', error)
      return `Ошибка сервера: ${error.message}`
    }
  }

  function newScenario(e) {
    e?.preventDefault?.()
    e?.stopPropagation?.()
    console.log('=== newScenario called ===')
    try {
    const s = { id: crypto.randomUUID(), name: 'New Scenario', items: [] }
      console.log('Creating scenario:', s.id)
      setScenarios(prev => {
        console.log('Setting scenarios, new scenario:', s.id, 'prev length:', prev.length)
        return [s, ...prev]
      })
    setActiveId(s.id)
      // Не открываем модальное окно сразу - пользователь может открыть его позже через кнопку
      // setNewScenarioId(s.id)
      // setJtbdPrompt('')
      // setShowJTBDModal(true)
      console.log('New scenario created:', s.id)
    } catch (error) {
      console.error('Error in newScenario:', error)
      alert('Ошибка при создании сценария: ' + error.message)
    }
  }

  function openJTBDModal() {
    if (!activeId) return
    setNewScenarioId(activeId)
    setJtbdPrompt('')
    setShowJTBDModal(true)
  }

  async function loadJTBD() {
    const scenarioId = newScenarioId || activeId
    if (!scenarioId) {
      console.log('loadJTBD: no scenarioId')
      return
    }
    
    const scenario = scenarios.find(s => s.id === scenarioId)
    if (!scenario) {
      console.log('loadJTBD: scenario not found', scenarioId)
      return
    }

    console.log('loadJTBD: loading for scenario', scenario.name, 'items:', scenario.items.length)
    setLoadingJTBD(true)
    
    if (scenario.items.length === 0) {
      setJtbdPrompt(`**Добавьте товары в сценарий, чтобы создать структуру лендинга.**

Нажмите "Добавить в сценарий" на карточках товаров слева, затем нажмите "📄 СОЗДАТЬ СЦЕНАРИЙ СТРАНИЦЫ" для генерации.`)
      setLoadingJTBD(false)
      return
    }

    const scenarioItems = scenario.items.map(x => {
      const it = items.find(i => i.id === x.itemId)
      // Используем полное название товара (it.name), не ID из имени файла
      return it ? { name: it.name || '', type: it.type || '', qty: x.qty } : null
    }).filter(Boolean)

    const aiResponse = await generateJTBDWithAI(scenario, scenarioItems)
    
    if (aiResponse) {
      setJtbdPrompt(aiResponse)
    } else {
      // Fallback если AI не ответил
      setJtbdPrompt(`**Ошибка генерации. Попробуйте еще раз или проверьте API ключ.**`)
    }
    
    setLoadingJTBD(false)
  }

  useEffect(() => {
    console.log('useEffect triggered:', { showJTBDModal, newScenarioId, activeId })
    if (showJTBDModal && (newScenarioId || activeId)) {
      console.log('Calling loadJTBD...')
      loadJTBD()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showJTBDModal, newScenarioId, activeId])

  async function regenerateJTBD() {
    const scenarioId = newScenarioId || activeId
    if (!scenarioId) return
    
    const scenario = scenarios.find(s => s.id === scenarioId)
    if (!scenario) return

    console.log('regenerateJTBD: scenario', scenario.name, 'items:', scenario.items.length)
    setLoadingJTBD(true)
    setJtbdPrompt('')

    const scenarioItems = scenario.items.map(x => {
      const it = items.find(i => i.id === x.itemId)
      return it ? { name: getNameFromImage(it.image) || it.name, type: it.type, qty: x.qty } : null
    }).filter(Boolean)

    if (scenarioItems.length === 0) {
      setJtbdPrompt(`Этот сценарий поможет создать товарную страницу, которая решает конкретную задачу клиента.

**Добавьте товары в сценарий, чтобы создать структуру лендинга.**

**Функциональная задача:**
- Какую практическую проблему решает этот набор товаров?
- Какую ситуацию/контекст использования описывает сценарий?

**Эмоциональная задача:**
- Какие чувства/эмоции получает клиент?
- Какой опыт он хочет получить?

**Социальная задача:**
- Как это улучшает отношения с другими?
- Какой образ/статус это создает?

**Начните добавлять товары в сценарий, и мы поможем сформулировать JTBD для товарной страницы!**`)
      setLoadingJTBD(false)
      return
    }

    const aiResponse = await generateJTBDWithAI(scenario, scenarioItems)
    
    if (aiResponse) {
      setJtbdPrompt(aiResponse)
    } else {
      // Fallback если AI не ответил
      setJtbdPrompt(`**Ошибка генерации. Попробуйте еще раз или проверьте API ключ.**`)
    }
    
    setLoadingJTBD(false)
  }

  function closeJTBDModal() {
    setShowJTBDModal(false)
    if (newScenarioId) {
      setActiveId(newScenarioId)
      setNewScenarioId(null)
    }
    setJtbdPrompt('')
  }

  async function regenerateJTBD() {
    const scenarioId = newScenarioId || activeId
    if (!scenarioId) return
    
    const scenario = scenarios.find(s => s.id === scenarioId)
    if (!scenario) return

    setLoadingJTBD(true)
    setJtbdPrompt('')

    const scenarioItems = scenario.items.map(x => {
      const it = items.find(i => i.id === x.itemId)
      return it ? { name: getNameFromImage(it.image) || it.name, type: it.type, qty: x.qty } : null
    }).filter(Boolean)

    if (scenarioItems.length === 0) {
      setJtbdPrompt(`Этот сценарий поможет создать товарную страницу, которая решает конкретную задачу клиента.

**Добавьте товары в сценарий, чтобы создать структуру лендинга.**

**Функциональная задача:**
- Какую практическую проблему решает этот набор товаров?
- Какую ситуацию/контекст использования описывает сценарий?

**Эмоциональная задача:**
- Какие чувства/эмоции получает клиент?
- Какой опыт он хочет получить?

**Социальная задача:**
- Как это улучшает отношения с другими?
- Какой образ/статус это создает?

**Начните добавлять товары в сценарий, и мы поможем сформулировать JTBD для товарной страницы!**`)
      setLoadingJTBD(false)
      return
    }

    const aiResponse = await generateJTBDWithAI(scenario, scenarioItems)
    
    if (aiResponse) {
      setJtbdPrompt(aiResponse)
    } else {
      // Fallback если AI не ответил
      setJtbdPrompt(`**Ошибка генерации. Попробуйте еще раз или проверьте API ключ.**`)
    }
    
    setLoadingJTBD(false)
  }

  function duplicateScenario() {
    const src = activeScenario
    const s = { id: crypto.randomUUID(), name: (src.name || 'Scenario') + ' (copy)', items: src.items.map(x => ({...x})) }
    setScenarios(prev => [s, ...prev])
    setActiveId(s.id)
  }

  function deleteScenario() {
    if (scenarios.length <= 1) return
    setScenarios(prev => prev.filter(s => s.id !== activeScenario.id))
    const next = scenarios.find(s => s.id !== activeScenario.id) || scenarios[0]
    setActiveId(next?.id || null)
  }

  function exportJSON() {
    download('scenario-builder.json', JSON.stringify({ items, scenarios, activeId }, null, 2))
  }

  function exportScenarioCSV() {
    const s = activeScenario
    const header = ['scenario','qty','sku','itemId','name','type','status','asin','cogs']
    const rows = (s.items || []).map(x => {
      const it = items.find(i => i.id === x.itemId)
      return [
        s.name,
        x.qty,
        it?.sku ?? '',
        it?.itemId ?? it?.id ?? x.itemId,
        it?.name ?? '',
        it?.type ?? '',
        it?.status ?? '',
        it?.asin ?? '',
        it?.cogs ?? '',
      ].map(escapeCsv).join(',')
    })
    const csv = header.join(',') + '\n' + rows.join('\n')
    download(`${slug(s.name || 'scenario')}.csv`, csv, 'text/csv')
  }

  function importJSONFile(file) {
    file.text().then(txt => {
      try {
        const data = JSON.parse(txt)
        if (data.scenarios?.length) {
          setScenarios(data.scenarios)
          setActiveId(data.activeId ?? data.scenarios[0].id)
        } else {
          alert('JSON выглядит странно: нет scenarios.')
        }
      } catch {
        alert('Не смог прочитать JSON.')
      }
    })
  }

  const dropRef = useRef(null)
  useEffect(() => {
    const dz = dropRef.current
    if (!dz) return
    const onOver = (e) => { e.preventDefault(); dz.classList.add('dragover') }
    const onLeave = () => dz.classList.remove('dragover')
    const onDrop = (e) => {
      e.preventDefault(); dz.classList.remove('dragover')
      const id = e.dataTransfer.getData('text/plain')
      if (id) addToScenario(id)
    }
    dz.addEventListener('dragover', onOver)
    dz.addEventListener('dragleave', onLeave)
    dz.addEventListener('drop', onDrop)
    return () => {
      dz.removeEventListener('dragover', onOver)
      dz.removeEventListener('dragleave', onLeave)
      dz.removeEventListener('drop', onDrop)
    }
  }, [activeScenario, items])


  // Проверка, что компонент рендерится
  console.log('App rendering, scenarios:', scenarios.length, 'showJTBDModal:', showJTBDModal)

  return (
    <>
      {/* JTBD Modal */}
      {showJTBDModal && (
        <div 
          className="modal-overlay" 
          onClick={closeJTBDModal} 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0,
            zIndex: 10000,
            overflowY: 'auto',
            overscrollBehavior: 'contain'
          }}
          onDragEnter={(e) => {
            // Закрываем модальное окно при начале перетаскивания товара
            e.preventDefault()
            e.stopPropagation()
            closeJTBDModal()
          }}
          onDragOver={(e) => {
            // Разрешаем drag and drop через модальное окно
            e.preventDefault()
            e.stopPropagation()
          }}
          onDrop={(e) => {
            // Закрываем модальное окно при drop, чтобы не блокировать добавление товаров
            e.preventDefault()
            e.stopPropagation()
            closeJTBDModal()
          }}
          onWheel={(e) => {
            // Разрешаем скролл внутри модального окна
            e.stopPropagation()
          }}
        >
          {console.log('Rendering modal, showJTBDModal:', showJTBDModal)}
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>📄 Сценарий страницы</h2>
              <button className="modal-close" onClick={closeJTBDModal}>×</button>
            </div>
            <div className="modal-body">
              {loadingJTBD ? (
                <div className="loading-jtbd">
                  <div className="spinner"></div>
                  <p>Генерирую сценарий...</p>
                </div>
              ) : (
                <div className="jtbd-prompt">
                  {jtbdPrompt ? jtbdPrompt.split('\n').map((line, i) => {
                    if (line.startsWith('**') && line.endsWith('**')) {
                      return <h3 key={i}>{line.replace(/\*\*/g, '')}</h3>
                    }
                    if (line.startsWith('📦') || line.startsWith('🏷️') || line.startsWith('🎯') || line.startsWith('💭') || line.startsWith('👥') || line.startsWith('📝') || line.startsWith('💡') || line.startsWith('1.') || line.startsWith('-')) {
                      return <p key={i} className="jtbd-item">{line}</p>
                    }
                    if (line.trim() === '') {
                      return <br key={i} />
                    }
                    return <p key={i}>{line}</p>
                  }) : (
                    <p>Генерирую сценарий...</p>
                  )}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button 
                className="btn" 
                onClick={regenerateJTBD}
                disabled={loadingJTBD}
                style={{ marginRight: 'auto', opacity: loadingJTBD ? 0.6 : 1 }}
              >
                {loadingJTBD ? 'Генерирую сценарий...' : 'Не очень, подумай еще'}
              </button>
              <button className="btn primary" onClick={() => {
                if (jtbdPrompt) {
                  const scenarioText = `Сценарий: ${activeScenario.name}\n\n${jtbdPrompt}`
                  download(`scenario-${slug(activeScenario.name || 'scenario')}.txt`, scenarioText, 'text/plain')
                }
                closeJTBDModal()
              }}>Понравилось, скачать сценарий</button>
            </div>
          </div>
        </div>
      )}

    <div className="page">
      <header className="topbar">
        <div className="brand">
          <div className="logo">O</div>
          <div>
            <div className="title">Owleys — Scenario Builder</div>
            <div className="subtitle">Слева склад, справа — сценарные комбо. Данные сохраняются локально в браузере.</div>
          </div>
        </div>

        <div className="topActions">
          <button className="btn" onClick={exportScenarioCSV}>Export active CSV</button>
        </div>
      </header>

      <main className="layout">
        {/* LEFT */}
        <section className="panel">
          <div className="panelBar">
            <input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Поиск: name / SKU / ASIN / type" />
            <select value={typeFilter} onChange={(e)=>setTypeFilter(e.target.value)}>
              <option value="">Все типы</option>
              {types.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select value={statusFilter} onChange={(e)=>setStatusFilter(e.target.value)}>
              <option value="">Все статусы</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <div className="muted">{loading ? 'Loading…' : `${filtered.length} items`}</div>
          </div>

          <div className="grid">
            {filtered.map(it => (
              <div key={it.id} className="card">
                <div className="thumb">
                  {getImageSrc(it.image)
                    ? <img src={getImageSrc(it.image)} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                    : null
                  }
                  <div className="ph" style={{ display: getImageSrc(it.image) ? 'none' : 'flex' }}>{placeholderThumb(it.name)}</div>
                  <div className="badge">{it.type || '—'}</div>
                </div>
                <div className="meta">
                  <div className="name">{it.name || getNameFromImage(it.image) || it.sku || 'Untitled item'}</div>
                  <div className="row">
                    <div className="mono">{it.sku || '—'}</div>
                    <div className="pill">{it.status || '—'}</div>
                  </div>
                  <div className="row muted small">
                    <span>ASIN: {it.asin || '—'}</span>
                    <span>COGS: {it.cogs ?? '—'}</span>
                  </div>
                  {(() => {
                    const isInScenario = activeScenario.items.some(x => x.itemId === it.id)
                    return (
                      <button 
                        className="btn" 
                        onClick={() => addToScenario(it.id)}
                        style={{ 
                          marginTop: '8px', 
                          width: '100%', 
                          fontSize: '12px', 
                          padding: '6px 10px',
                          background: isInScenario ? '#7aa2ff' : '#16223a',
                          color: isInScenario ? '#fff' : '#e9eefc',
                          border: isInScenario ? '1px solid #7aa2ff' : '1px solid #1d2740'
                        }}
                      >
                        {isInScenario ? '✓ В сценарии' : '➕ Добавить в сценарий'}
                      </button>
                    )
                  })()}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* RIGHT */}
        <section className="panel">
          <div className="panelBar right">
            <div className="tabs">
              {scenarios.map(s => (
                <button
                  key={s.id}
                  className={classNames('tab', s.id===activeScenario.id && 'active')}
                  onClick={()=>setActiveId(s.id)}
                  title={s.name}
                >
                  {s.name || 'Untitled'}
                </button>
              ))}
            </div>
            <div className="barActions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button 
                className="btn" 
                onClick={(e) => {
                  console.log('Button clicked!', e)
                  newScenario(e)
                }}
                type="button"
                style={{ background: '#16223a', color: '#e9eefc', border: '1px solid #1d2740', padding: '8px 10px', borderRadius: '10px', cursor: 'pointer', fontWeight: '700', fontSize: '13px' }}
              >
                + Scenario
              </button>
              <button className="btn" onClick={duplicateScenario}>Duplicate</button>
              <button className="btn danger" onClick={deleteScenario}>Delete</button>
            </div>
          </div>

          <div className="rightBody">
            <div className="scenarioHeader">
              <div>
                <div className="muted">Активный сценарий</div>
                <input
                  value={activeScenario.name || ''}
                  onChange={(e)=>renameScenario(e.target.value)}
                  placeholder="Например: Tesla Model 3 — Dog Roadtrip"
                />
              </div>
              <div className="hint">
                Нажмите "Добавить в сценарий" на карточках товаров слева.
                <br/>
                <button 
                  className="btn" 
                  onClick={openJTBDModal}
                  style={{ marginTop: '8px', fontSize: '12px', padding: '6px 10px' }}
                >
                  📄 СОЗДАТЬ СЦЕНАРИЙ СТРАНИЦЫ
                </button>
              </div>
            </div>

            <div className="dropzone" ref={dropRef}>
              {(activeScenario.items?.length ?? 0) === 0 ? (
                <div className="empty">
                  <b>Пока пусто.</b> Нажмите "Добавить в сценарий" на карточках товаров слева.
                </div>
              ) : (
                <div className="list">
                  {activeScenario.items.map(x => {
                    const it = items.find(i => i.id === x.itemId)
                    if (!it) return null
                    return (
                      <div key={x.itemId} className="line">
                        <div className="lineLeft">
                          <div className="mini">
                            {getImageSrc(it.image)
                              ? <img src={getImageSrc(it.image)} alt="" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling.style.display = 'flex'; }} />
                              : null
                            }
                            <div className="phMini" style={{ display: getImageSrc(it.image) ? 'none' : 'flex' }}>{placeholderThumb(it.name)}</div>
                          </div>
                          <div>
                            <div className="lineName">{getNameFromImage(it.image) || it.name}</div>
                            <div className="mono muted">{it.sku} · {it.type}</div>
                            <div className="muted small" style={{ fontSize: '11px', marginTop: '4px' }}>
                              ASIN: {it.asin || '—'} · COGS: {it.cogs ?? '—'}
                            </div>
                          </div>
                        </div>
                        <div className="lineRight">
                          <input className="qty" type="number" min="1" value={x.qty} onChange={(e)=>setQty(x.itemId, e.target.value)} />
                          <button className="btn danger" onClick={()=>removeFromScenario(x.itemId)}>✕</button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <textarea
              className="out"
              readOnly
              value={(activeScenario.items||[]).map(x=>{
                const it = items.find(i=>i.id===x.itemId)
                if (!it) return ''
                const displayName = getNameFromImage(it.image) || it.name
                const parts = [
                  `${x.qty}× ${displayName}`,
                  it.sku ? `SKU: ${it.sku}` : null,
                  it.asin ? `ASIN: ${it.asin}` : null,
                  it.cogs != null ? `COGS: ${it.cogs}` : null
                ].filter(Boolean)
                return parts.join(' · ')
              }).filter(Boolean).join('\n')}
            />
          </div>
        </section>
      </main>
    </div>
    </>
  )
}
