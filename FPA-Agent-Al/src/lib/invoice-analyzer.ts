import getDb from './db';

const JSON_SCHEMA = `
{
  "client_name": "string (Nom complet de l'entreprise client)",
  "client_abbreviation": "string (Abréviation du client, ex: CMR, WASAL, PAR3COM)",
  "contact_person": "string (Responsable/Contact si disponible)",
  "contact_civility": "string (M. or Mme or Mlle, default M.)",
  "client_address": "string (Adresse complète du client)",
  "client_ice": "string (15 chiffres ICE du client si disponible)",
  "reference": "string (Référence de marché ou contrat)",
  "items": [
    {
      "description": "string (Description de la prestation)",
      "detail": "string (Détails additionnels, milestone, livrables)",
      "quantity": 1,
      "unit": "string (default: forfait)",
      "unit_price": 0,
      "total_ht": 0
    }
  ],
  "subtotal_ht": 0,
  "tva_rate": 20,
  "tva_amount": 0,
  "total_ttc": 0,
  "invoice_date": "string (Format YYYY-MM-DD)"
}
`;

const PROMPT_INSTRUCTIONS = `
Analyze the provided document (invoice, bill, note of honoraires, or text command) and extract the invoice details.
You must return ONLY a valid JSON object matching this schema:
${JSON_SCHEMA}

Rules:
1. Ensure all mathematical calculations are valid (total_ht = quantity * unit_price, subtotal_ht = sum of item total_ht, tva_amount = subtotal_ht * tva_rate / 100, total_ttc = subtotal_ht + tva_amount).
2. If certain client details (like ICE, RC, address) are missing, attempt to lookup or infer them, or leave empty.
3. You must output ONLY the raw JSON string inside brackets { ... }. Do not include markdown codeblocks (no \`\`\`json) or extra text.
`;

export async function analyzeInvoiceDocument(fileBase64?: string, mimeType?: string, textPrompt?: string): Promise<any> {
  const db = getDb();
  
  // Fetch API key from general settings
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('openrouter_api_key') as { value: string } | undefined;
  const apiKey = process.env.OPENROUTER_API_KEY || row?.value;
  
  const modelRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('openrouter_model') as { value: string } | undefined;
  const model = process.env.OPENROUTER_MODEL || modelRow?.value || 'google/gemini-2.5-flash';

  if (!apiKey) {
    throw new Error('OpenRouter API key is not configured. Please set it in system settings.');
  }

  // Build payload
  const messages: any[] = [];
  const contentArray: any[] = [{ type: 'text', text: PROMPT_INSTRUCTIONS }];

  if (fileBase64 && mimeType) {
    contentArray.push({
      type: 'image_url',
      image_url: {
        url: `data:${mimeType};base64,${fileBase64}`
      }
    });
  }

  if (textPrompt) {
    contentArray.push({
      type: 'text',
      text: `Prompt command / contextual note: ${textPrompt}`
    });
  }

  messages.push({ role: 'user', content: contentArray });

  console.log(`[ANALYZER] Calling AI model ${model} via OpenRouter...`);

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.1,
    }),
  });

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content || '';

  try {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.error('[ANALYZER] JSON Parse failed. Raw response:', content);
  }

  throw new Error('AI failed to extract structured invoice data from the document.');
}
