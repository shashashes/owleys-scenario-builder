// server.js
import express from "express";
import OpenAI from "openai";
import cors from "cors";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Загружаем базу данных товаров
let productsDatabase = [];
try {
  const productsData = JSON.parse(readFileSync(join(__dirname, "public/products_database.json"), "utf-8"));
  productsDatabase = productsData;
} catch (e) {
  console.warn("Could not load products database:", e.message);
}

app.post("/api/scenarios", async (req, res) => {
  try {
    const { inventory, constraints } = req.body;

    if (!Array.isArray(inventory) || inventory.length === 0) {
      return res.status(400).json({ error: "inventory must be a non-empty array" });
    }

    const system = `You are Owleys Scenario Lab.
Return ONLY valid JSON (no markdown, no prose).
No SKUs. Use product titles exactly as provided in inventory[].title.
No fluff. No clichés ("perfect", "must-have", "ultimate", "best").
If scenario sounds like Amazon category, it FAILS and must be rewritten until PASS.

You must output:
{
  "scenarios": [
    {
      "scenario_name": "Title Case, 2-4 words",
      "tagline": "1 line outcome promise",
      "gallery_frames": [{"frame": 1, "scene": "..."}, ... 5-7],
      "products": [{"title": "...", "role": "1 line role in system"}, ...],
      "page_blocks": [{"block": 1, "title": "...", "content": "... (no fluff)"}, ... 5],
      "who_this_is_for": {
        "primary_audience": "...",
        "secondary_audience": "...",
        "trigger_moment": "..."
      },
      "anti_banal_check": {"pass": true, "reasons": ["..."]},
      "final_quality_score_0_100": 85
    }
  ]
}

Rules:
- Each scenario must be a SYSTEM (each product has unique role).
- If anti_banal_check.pass=false -> rewrite the scenario_name + frames + blocks until pass=true.
- We sell STATE inside the car, not accessories.
- Gallery frames must tell a story without text (situations, not product photos).`;

    // Подготовка инвентаря для промпта
    const inventoryText = inventory.map(item => 
      `${item.qty || 1}× ${item.title || item.name}${item.category ? ` (${item.category})` : ''}`
    ).join('\n');

    // Добавляем релевантные товары из базы данных
    let productsContext = '';
    if (productsDatabase.length > 0) {
      const relevantProducts = productsDatabase.filter(p => {
        const titleLower = (p.title || '').toLowerCase();
        const descLower = (p.description || '').toLowerCase();
        return inventory.some(item => {
          const itemNameLower = (item.title || item.name || '').toLowerCase();
          const keywords = itemNameLower.split(/\s+/).filter(w => w.length > 3);
          return keywords.some(kw => titleLower.includes(kw) || descLower.includes(kw));
        });
      }).slice(0, 15);
      
      if (relevantProducts.length > 0) {
        productsContext = `\n\nRelevant products from Owleys catalog:\n${relevantProducts.map(p => 
          `- ${p.title}: ${p.description?.substring(0, 200) || ''}`
        ).join('\n')}`;
      }
    }

    const user = `Generate 1 non-trivial scenario page for Owleys based on available inventory.

Inventory:
${inventoryText}${productsContext}

Constraints: ${JSON.stringify(constraints || {})}`;

    const response = await client.chat.completions.create({
      model: "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user }
      ],
      temperature: 0.7,
      max_tokens: 3000,
      response_format: { type: "json_object" }
    });

    const text = response.choices[0]?.message?.content || '{}';

    // Validate JSON
    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ 
        error: "Model did not return valid JSON", 
        raw: text.substring(0, 500),
        parseError: e.message
      });
    }

    return res.json(json);
  } catch (e) {
    console.error("Error in /api/scenarios:", e);
    return res.status(500).json({ error: e?.message ?? "unknown error", stack: e?.stack });
  }
});

const PORT = process.env.PORT || 8787;
app.listen(PORT, () => console.log(`Scenario Lab on http://localhost:${PORT}`));

