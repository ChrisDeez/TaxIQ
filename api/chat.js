export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system } = req.body;

    // Build Gemini conversation
    const contents = messages.map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }));

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GOOGLE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents,
          tools: [{ googleSearch: {} }],
          generationConfig: { maxOutputTokens: 4096 }
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data.error?.message || 'Gemini error' });
    }

    const text = data.candidates?.[0]?.content?.parts?.map(p => p.text).join('') || '';
    const groundingChunks = data.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const searched = groundingChunks.length > 0;

    // Return in Anthropic-compatible format
    res.status(200).json({
      content: [{ type: 'text', text }],
      stop_reason: 'end_turn',
      searched,
      sources: groundingChunks.map(c => c.web?.title || '').filter(Boolean)
    });

  } catch (error) {
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
