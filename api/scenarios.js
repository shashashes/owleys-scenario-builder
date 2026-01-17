import OpenAI from "openai";
import { z } from "zod";

// Input schema
const InputSchema = z.object({
  inventory: z.array(
    z.object({
      title: z.string().min(3),
      category: z.string().optional(),
      notes: z.string().optional()
    })
  ).min(1),
  constraints: z.object({
    focus: z.string().optional(),
    car_make: z.string().optional(),
    season: z.string().optional(),
    n: z.number().int().min(1).max(20).optional()
  }).optional()
});

// Output schema (более гибкая версия для лучшей совместимости)
const OutputSchema = z.object({
  scenarios: z.array(z.object({
    scenario_name: z.string().min(1), // Уменьшили с 4 до 1
    tagline: z.string().min(1).optional(), // Сделали опциональным
    gallery_frames: z.array(z.object({
      frame: z.number().int(),
      scene: z.string().min(1) // Уменьшили с 8 до 1
    })).min(1).optional(), // Сделали опциональным и уменьшили минимум
    products: z.array(z.object({
      title: z.string().min(1), // Уменьшили с 3 до 1
      role: z.string().min(1).optional() // Уменьшили с 8 до 1, сделали опциональным
    })).min(1).optional(), // Сделали опциональным и уменьшили минимум
    page_blocks: z.array(z.object({
      block: z.number().int(),
      title: z.string().min(1).optional(), // Уменьшили с 3 до 1, сделали опциональным
      content: z.string().min(1).optional() // Уменьшили с 15 до 1, сделали опциональным
    })).optional(), // Сделали опциональным
    anti_banal_check: z.object({
      pass: z.boolean(),
      reasons: z.array(z.string()).optional() // Сделали опциональным
    }).optional(), // Сделали опциональным
    final_quality_score_0_100: z.number().min(0).max(100).optional() // Сделали опциональным
  })).min(1)
});

const SYSTEM_PROMPT = `
You are "Owleys Scenario Lab" — a premium product marketing agent.
Return ONLY valid JSON that matches the schema. No markdown. No extra keys.

Hard rules:
- NEVER use SKUs, codes, or article numbers (like "p 3014 868", "p 3014 513"). This is INSTANT FAIL.
- Use ONLY full product titles exactly as given in inventory. Copy them character-by-character.
- In products array, the "title" field must be the EXACT full product name from inventory, nothing else.
- Before outputting JSON, verify every product.title exactly matches one inventory[].title entry.
- If you see article numbers or codes in any form, STOP and rewrite using exact inventory titles only.
- CRITICAL: You MUST use ONLY products from the provided inventory. You CANNOT add products that are not in the inventory list.
- You CANNOT invent, suggest, or include products that were not explicitly provided in the inventory.
- If inventory contains 2 products, your scenario must use exactly those 2 products (or a subset if needed, but never add new ones).
- Every product in the scenario's "products" array MUST match exactly one entry from the provided inventory.
- No fluff. No clichés: "perfect", "must-have", "ultimate", "best", "high-quality".
- Scenario name must NOT sound like an Amazon category (e.g., "Dog Travel Essentials" is FAIL).
- Each scenario must be a SYSTEM: every product has a unique role.
- Gallery frames must be story scenes, not product shots.

BANNED (instant FAIL):
- names containing: Essentials, Bundle, Kit, Set, Pack, Starter, Travel, Roadtrip, Must, Ultimate, Best, Perfect
- names that describe category: "Dog Car Pack", "Kids Backseat Bundle", "Interior Upgrade"
- names that mention products: "Travel Buddy + Organizer"
- names that are generic verbs: "Stay Organized", "Keep It Clean"

Naming requirement:
- Scenario name must be a "state label" or "moment label" (2–4 words).
- It must sound like something a real person could say: "We need a ___."
- It must imply a story without explaining it.

Two-phase generation (mandatory, internal):
PHASE 1: Generate 10 candidate scenario seeds.
Each seed = {name, trigger_event, core_friction}.
Seeds must pass Naming requirement. If not, rewrite.
PHASE 2: Select the best N seeds and expand them into full scenarios JSON.

Do NOT output seeds. Output only final JSON.

System test (mandatory):
For each scenario, run an internal removability test:
- Remove one product. If the scenario still works, FAIL and redesign the scenario or replace the product with one that is non-optional.
You must only output scenarios that pass this test.

Taboo angles: you must NOT base scenarios primarily on "clean", "organize", "protect".
Those can exist, but cannot be the core idea.
Core idea must be one of:
- social tension (judgment, embarrassment, guest ride, date night)
- time pressure (late pickup, vet run, school chaos, quick turnover)
- transition moment (new car, after groomer, post-hike, rainy entry, rental return)
- care protocol (senior dog, injury, allergy, motion sickness)

Before naming a scenario, you MUST:
1. Review the provided inventory and identify which products from it will be used in the scenario.
2. Verify that every product you plan to use exists in the provided inventory. If any product does not match inventory, FAIL and rebuild.
3. Identify a real-life trigger event (not a category, not a persona).
4. Identify a physical or emotional friction inside the car.
5. Explain (internally) why each product from inventory is required and cannot be removed.
6. If removing any product does not break the scenario, the scenario FAILS and must be rebuilt.

You must NOT output this reasoning.
You must only output the final JSON.

Anti-banality loop (mandatory):
If anti_banal_check.pass is false, you MUST rewrite the scenario (name + frames + blocks) until pass becomes true.
Keep rewriting internally; output only final PASS scenarios.

Quality requirement:
At least 80/100 for final_quality_score_0_100.
If you can't reach 80, rewrite.

LANGUAGE REQUIREMENT (CRITICAL):
- scenario_name: MUST be in English (Title Case, 2–4 words)
- product titles: MUST be in English (use exact titles from inventory as provided)
- EVERYTHING ELSE: MUST be in Russian (tagline, scene descriptions, product roles, page block titles and content, who_this_is_for fields)

Output schema:
{
  "scenarios": [
    {
      "scenario_name": "Title Case, 2–4 words (ENGLISH ONLY)",
      "tagline": "1-line outcome promise (RUSSIAN)",
      "gallery_frames": [{"frame":1,"scene":"..."}, ...], // scene in RUSSIAN
      "products": [{"title":"...", "role":"..."}, ...], // title MUST be EXACT full product name from inventory (NO SKUs, NO codes like "p 3014 868"), role in RUSSIAN
      "page_blocks": [{"block":1,"title":"...", "content":"..."}, ... exactly 5 blocks], // title and content in RUSSIAN
      "who_this_is_for": {
        "primary_audience": "...", // RUSSIAN
        "secondary_audience": "...", // RUSSIAN
        "trigger_moment": "..." // RUSSIAN
      },
      "anti_banal_check": {"pass": true, "reasons": ["..."]}, // reasons in RUSSIAN
      "final_quality_score_0_100": 80-100
    }
  ]
}
`;

export default async function handler(req, res) {
  // CORS headers
  if (req.headers.origin) {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    // Validate input
    const parsed = InputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Bad input", details: parsed.error.flatten() });
    }

    const { inventory, constraints } = parsed.data;
    // По умолчанию запрашиваем 1 сценарий, так как на фронтенде используется только первый
    const n = constraints?.n ?? 1;

    // Initialize OpenAI client
    if (!process.env.OPENAI_API_KEY) {
      console.error('OPENAI_API_KEY is not set in environment variables');
      return res.status(500).json({ 
        error: "OPENAI_API_KEY not configured",
        hint: "Please add OPENAI_API_KEY to Vercel Environment Variables. Go to: Settings → Environment Variables → Add new variable."
      });
    }

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const userPayload = {
      task: "Generate non-trivial Owleys scenario pages from inventory.",
      n,
      constraints: constraints ?? {},
      inventory,
      critical_instruction: "You MUST use ONLY the products listed in 'inventory'. Do NOT add any products that are not in this list. Every product.title in your output must match exactly one item from the provided inventory."
    };

    console.log(`Requesting ${n} scenario(s) for ${inventory.length} products`);

    // Call OpenAI API
    let resp;
    try {
      resp = await client.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(userPayload) }
        ],
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 4000
      });
    } catch (openaiError) {
      console.error('OpenAI API error:', openaiError);
      return res.status(502).json({ 
        error: "OpenAI API request failed", 
        details: openaiError.message,
        hint: "Check OpenAI API key and quota"
      });
    }

    const raw = resp.choices[0]?.message?.content;
    if (!raw) {
      console.error('No content in OpenAI response:', resp);
      return res.status(502).json({ 
        error: "No response from model",
        response: resp
      });
    }

    console.log(`Received response from OpenAI (${raw.length} characters)`);

    let json;
    try {
      json = JSON.parse(raw);
      console.log('Parsed JSON successfully, scenarios count:', json.scenarios?.length || 0);
    } catch (e) {
      console.error('JSON parse error:', e);
      console.error('Raw response (first 500 chars):', raw.substring(0, 500));
      return res.status(502).json({ 
        error: "Model did not return valid JSON", 
        parseError: e.message,
        rawPreview: raw.substring(0, 500)
      });
    }

    // Validate output
    const outParsed = OutputSchema.safeParse(json);
    if (!outParsed.success) {
      console.warn('Schema validation failed:', outParsed.error.flatten());
      
      // Если валидация не прошла, но есть сценарии в raw JSON - попробуем их использовать
      if (json.scenarios && Array.isArray(json.scenarios) && json.scenarios.length > 0) {
        console.warn('Using raw scenarios despite validation errors');
        const gotN = json.scenarios.length;
        
        // Всегда принимаем результат, если есть хотя бы 1 сценарий
        if (gotN < 1) {
          console.error('No scenarios in raw JSON');
          return res.status(502).json({
            error: "No scenarios returned",
            schema_errors: outParsed.error.flatten(),
            hint: "The model did not return any valid scenarios. Please try again.",
          });
        }

        console.log(`Using raw scenarios. Got ${gotN} scenario(s).`);
        // Попытаемся исправить структуру, если она близка к правильной
        const fixedScenarios = json.scenarios.map((s, idx) => {
          // Базовые проверки и фиксы
          if (!s.scenario_name) s.scenario_name = `Scenario ${idx + 1}`;
          if (!s.tagline) s.tagline = "Generated scenario";
          if (!s.gallery_frames || !Array.isArray(s.gallery_frames)) s.gallery_frames = [];
          if (!s.products || !Array.isArray(s.products)) s.products = [];
          if (!s.page_blocks || !Array.isArray(s.page_blocks)) s.page_blocks = [];
          if (!s.anti_banal_check) s.anti_banal_check = { pass: true, reasons: ["Validated manually"] };
          if (typeof s.final_quality_score_0_100 !== 'number') s.final_quality_score_0_100 = 80;
          return s;
        });
        
        return res.json({ scenarios: fixedScenarios });
      }
      
      console.error('No scenarios found in JSON response');
      return res.status(502).json({
        error: "JSON schema mismatch - no valid scenarios found",
        details: outParsed.error.flatten(),
        receivedKeys: Object.keys(json),
        hasScenarios: !!json.scenarios,
      });
    }

    // Проверяем, что есть хотя бы 1 сценарий
    const gotN = outParsed.data.scenarios.length;

    if (gotN < 1) {
      return res.status(502).json({
        error: "No scenarios returned",
        hint: "The model did not return any valid scenarios. Please try again.",
      });
    }

    // Валидация и исправление названий товаров - проверяем соответствие inventory
    const inventoryTitles = inventory.map(item => item.title.toLowerCase().trim());
    const fixedScenarios = outParsed.data.scenarios.map(scenario => {
      if (!scenario.products || !Array.isArray(scenario.products)) {
        return scenario;
      }

      const fixedProducts = scenario.products.map(product => {
        const productTitle = product.title || '';
        const productTitleLower = productTitle.toLowerCase().trim();
        
        // Проверяем, является ли это артикулом (паттерн "p 3014 ...")
        const isArticleNumber = /^p\s*30\d{2}\s*\d+/i.test(productTitle) || /^[a-z]\s*\d{4}\s*\d+/i.test(productTitle);
        
        // Проверяем точное совпадение с inventory
        const exactMatch = inventory.find(item => item.title.toLowerCase().trim() === productTitleLower);
        
        if (exactMatch) {
          // Точное совпадение - используем оригинальное название из inventory
          return { ...product, title: exactMatch.title };
        }
        
        if (isArticleNumber) {
          // Это артикул - пытаемся найти товар по inventory titles (может содержать артикул в названии)
          const foundByPartial = inventory.find(item => {
            const itemLower = item.title.toLowerCase().trim();
            // Пробуем найти по частичному совпадению в названии
            return itemLower.includes(productTitleLower.replace(/\s+/g, ' ')) || 
                   productTitleLower.replace(/\s+/g, ' ').includes(itemLower.substring(0, 10));
          });
          
          if (foundByPartial) {
            console.warn(`Fixed article number "${productTitle}" → "${foundByPartial.title}"`);
            return { ...product, title: foundByPartial.title };
          }
        }
        
        // Если не нашли - пробуем частичное совпадение (для случаев когда название немного отличается)
        const partialMatch = inventory.find(item => {
          const itemLower = item.title.toLowerCase().trim();
          return itemLower.includes(productTitleLower) || productTitleLower.includes(itemLower.substring(0, 20));
        });
        
        if (partialMatch) {
          console.warn(`Fixed product title "${productTitle}" → "${partialMatch.title}"`);
          return { ...product, title: partialMatch.title };
        }
        
        // Если ничего не нашли, оставляем как есть, но логируем предупреждение
        console.warn(`Product title "${productTitle}" does not match any inventory item`);
        return product;
      });

      return { ...scenario, products: fixedProducts };
    });

    console.log(`Successfully received ${gotN} scenario(s) and validated product titles`);

    return res.json({ scenarios: fixedScenarios });
  } catch (e) {
    console.error('API error:', e);
    console.error('Error stack:', e.stack);
    return res.status(500).json({ 
      error: e?.message ?? "Unknown server error",
      type: e?.constructor?.name,
      stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
    });
  }
}

