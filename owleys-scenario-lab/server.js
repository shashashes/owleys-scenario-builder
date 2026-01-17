import express from "express";
import cors from "cors";
import OpenAI from "openai";
import { z } from "zod";

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

// 1) API key only from ENV
const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// 2) Strict input schema
const InputSchema = z.object({
  inventory: z.array(
    z.object({
      title: z.string().min(3),
      category: z.string().optional(),
      notes: z.string().optional()
    })
  ).min(1),  // Минимум 1 товар (реальная проверка будет в логике сценариев)
  constraints: z.object({
    focus: z.string().optional(),        // e.g. "Dog", "Kids", "Interior", "Car Make"
    car_make: z.string().optional(),     // e.g. "Toyota"
    season: z.string().optional(),       // e.g. "Q1"
    n: z.number().int().min(1).max(20).optional()
  }).optional()
});

// 3) Expected output schema (anti-banal built in)
const OutputSchema = z.object({
  scenarios: z.array(z.object({
    scenario_name: z.string().min(4),
    tagline: z.string().min(8),
    gallery_frames: z.array(z.object({
      frame: z.number().int(),
      scene: z.string().min(8)
    })).min(5).max(7),
    products: z.array(z.object({
      title: z.string().min(3),
      role: z.string().min(8)
    })).min(2).max(8),
    page_blocks: z.array(z.object({
      block: z.number().int(),
      title: z.string().min(3),
      content: z.string().min(15)
    })).min(5).max(5),
    anti_banal_check: z.object({
      pass: z.boolean(),
      reasons: z.array(z.string()).min(1)
    }),
    final_quality_score_0_100: z.number().min(0).max(100)
  })).min(1)  // Минимальное количество проверяется вручную после валидации
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

app.post("/api/scenarios", async (req, res) => {
  try {
    const parsed = InputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: "Bad input", details: parsed.error.flatten() });
    }

    const { inventory, constraints } = parsed.data;
    const n = constraints?.n ?? 10;

    const userPayload = {
      task: "Generate non-trivial Owleys scenario pages from inventory.",
      n,
      constraints: constraints ?? {},
      inventory
    };

    const resp = await client.responses.create({
      model: "gpt-5.2",
      input: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: JSON.stringify(userPayload) }
      ]
    });

    const raw = resp.output_text;

    let json;
    try { json = JSON.parse(raw); }
    catch {
      return res.status(502).json({ error: "Model did not return JSON", raw });
    }

    const outParsed = OutputSchema.safeParse(json);
    if (!outParsed.success) {
      // Если валидация не прошла, но есть сценарии в raw JSON - попробуем их использовать
      if (json.scenarios && Array.isArray(json.scenarios) && json.scenarios.length > 0) {
        console.warn('Schema validation failed, but using raw scenarios:', outParsed.error.flatten());
        // Проверяем количество
        const wantN = n;
        const gotN = json.scenarios.length;
        
        if (gotN < wantN) {
          return res.status(502).json({
            error: "Not enough scenarios returned",
            want: wantN,
            got: gotN,
            scenario_names: json.scenarios.map(s => s?.scenario_name || 'Unknown'),
            schema_errors: outParsed.error.flatten(),
            hint: "Increase model reliability by lowering n or re-running; or add internal retry loop.",
          });
        }
        
        // Возвращаем raw JSON даже если валидация не прошла
        return res.json({ scenarios: json.scenarios });
      }
      
      return res.status(502).json({
        error: "JSON schema mismatch",
        details: outParsed.error.flatten(),
        raw: json,
      });
    }

    // 👇 контроль количества сценариев
    const wantN = n; // n уже вычислен выше: const n = constraints?.n ?? 10;
    const gotN = outParsed.data.scenarios.length;

    if (gotN < wantN) {
      return res.status(502).json({
        error: "Not enough scenarios returned",
        want: wantN,
        got: gotN,
        scenario_names: outParsed.data.scenarios.map(s => s.scenario_name),
        hint: "Increase model reliability by lowering n or re-running; or add internal retry loop.",
      });
    }

    return res.json(outParsed.data);
  } catch (e) {
    return res.status(500).json({ error: e?.message ?? "Unknown server error" });
  }
});

app.get("/health", (_, res) => res.json({ ok: true }));

app.listen(8787, () => console.log("Owleys Scenario Lab: http://localhost:8787"));

