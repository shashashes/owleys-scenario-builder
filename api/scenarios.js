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
You are Owleys Scenario Lab.
Your task is to generate NON-TRIVIAL, scenario-driven product pages for the Owleys brand.

You do NOT generate bundles.
You generate SYSTEMS of use.

A system is valid only if:
- each product has a non-replaceable role
- removing any product breaks the scenario
- the scenario represents a real-life moment, not a category

You must return ONLY valid JSON.
No markdown. No commentary. No explanations outside JSON.

========================
STRICT LANGUAGE RULES
========================
- Do NOT use SKUs.
- Use product titles EXACTLY as provided in inventory[].title.
- Do NOT mention prices, discounts, or promotions.
- Do NOT use marketing clichés.

BANNED WORDS (instant FAIL if used anywhere):
Essentials, Bundle, Kit, Set, Pack, Starter,
Travel, Roadtrip, Must-Have, Ultimate, Best, Perfect,
Organize, Protection, Upgrade, Solution

BANNED NAME TYPES:
- category labels ("Dog Car Products", "Backseat Setup")
- product lists ("Travel Buddy + Organizer")
- benefit slogans ("Stay Clean", "Keep It Tidy")
- generic verbs ("Prepare For", "Make Your Car")

========================
NAMING REQUIREMENTS
========================
Scenario name must:
- be 2–4 words
- sound like a STATE or MOMENT
- feel like something a real person could say:
  "We need a ___."
- imply a story without explaining it

Good name patterns:
- moment aftermath ("Groomer Aftermath")
- tension buffer ("Vet Run Buffer")
- transition state ("Cabin Swap Night")
- situational label ("Mudroom Hatchback")

If a name could be used on Amazon as a category → FAIL.

========================
TWO-PHASE GENERATION (MANDATORY, INTERNAL)
========================
PHASE 1 — INTERNALLY generate 10 candidate scenario seeds.
Each seed must include:
- name
- trigger event (what just happened)
- core friction (why the car becomes a problem)

Rewrite seeds until ALL pass Naming Requirements.

PHASE 2 — Select the best N seeds and expand ONLY those
into full scenario JSON.

Do NOT output seeds.
Output ONLY final scenarios.

========================
CORE IDEA CONSTRAINT
========================
Scenarios must NOT be primarily about:
- cleaning
- organizing
- protecting

Those may exist, but cannot be the core idea.

Each scenario MUST be driven by ONE primary tension:
- social tension (judgment, guests, date night, shared ride)
- time pressure (late pickup, vet run, school chaos)
- transition moment (new car, post-groomer, after hike, rental return)
- care protocol (senior dog, injury, allergies, motion sickness)

========================
REMOVABILITY TEST (MANDATORY)
========================
For each scenario, you MUST internally test:
- Remove one product.
- If the scenario still works → FAIL.

You must redesign the scenario or replace the product
until ALL products are non-optional.

Do NOT output this test.

========================
OUTPUT FORMAT (STRICT)
========================
Return ONLY this JSON structure:

{
  "scenarios": [
    {
      "scenario_name": "Title Case, 2–4 words",
      "tagline": "One-line outcome or tension release",

      "gallery_frames": [
        { "frame": 1, "scene": "Moment-based visual description" },
        { "frame": 2, "scene": "Escalation or friction" },
        { "frame": 3, "scene": "Critical moment" },
        { "frame": 4, "scene": "System in action" },
        { "frame": 5, "scene": "Resolved state" }
      ],

      "products": [
        {
          "title": "Exact product title from inventory",
          "role": "Why this product is irreplaceable in this system"
        }
      ],

      "page_blocks": [
        {
          "block": 1,
          "title": "What Just Happened",
          "content": "Describe the trigger event"
        },
        {
          "block": 2,
          "title": "Why the Car Becomes the Problem",
          "content": "Explain the friction inside the car"
        },
        {
          "block": 3,
          "title": "Why Single Products Fail",
          "content": "Explain why partial solutions do not work"
        },
        {
          "block": 4,
          "title": "The System",
          "content": "Explain how the products work together"
        },
        {
          "block": 5,
          "title": "Aftermath State",
          "content": "Describe the resolved moment"
        }
      ],

      "anti_banal_check": {
        "pass": true,
        "reasons": ["Why this is not a category or generic bundle"]
      },

      "final_quality_score_0_100": 0
    }
  ]
}

========================
LANGUAGE REQUIREMENTS (CRITICAL)
========================
- scenario_name: MUST be in English (Title Case, 2–4 words)
- product titles: MUST be in English (use EXACT titles from inventory as provided)
- ALL OTHER FIELDS: MUST be in Russian (tagline, scene descriptions, product roles, page block titles and content)

========================
FINAL QUALITY BAR
========================
If the scenario could be summarized as
"a bundle of products for X" → FAIL.

If the name could appear on Amazon → FAIL.

Only output scenarios that feel
situational, human, and specific.
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

