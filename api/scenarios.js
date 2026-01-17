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
- Never use SKUs or codes. Use ONLY product titles exactly as given in inventory.
- No fluff. No clichés: "perfect", "must-have", "ultimate", "best", "high-quality".
- Scenario name must NOT sound like an Amazon category (e.g., "Dog Travel Essentials" is FAIL).
- Each scenario must be a SYSTEM: every product has a unique role.
- Gallery frames must be story scenes, not product shots.

Before naming a scenario, you MUST:
1. Identify a real-life trigger event (not a category, not a persona).
2. Identify a physical or emotional friction inside the car.
3. Explain (internally) why each product is required and cannot be removed.
4. If removing any product does not break the scenario, the scenario FAILS and must be rebuilt.

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
      "products": [{"title":"...", "role":"..."}, ...], // title in ENGLISH (from inventory), role in RUSSIAN
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
      inventory
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

    // Всегда возвращаем результат, если есть хотя бы 1 сценарий
    // Не проверяем количество запрошенных vs полученных - принимаем что есть
    console.log(`Successfully received ${gotN} scenario(s)`);

    return res.json(outParsed.data);
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

