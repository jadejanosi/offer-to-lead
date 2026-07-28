export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { userInput } = req.body;
  if (!userInput) return res.status(400).json({ error: 'Missing input' });

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const headers = {
    'x-api-key': process.env.ANTHROPIC_API_KEY,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };

  function extractText(data) {
    if (!data.content || !Array.isArray(data.content)) return null;
    const block = data.content.find(function(b) { return b.type === 'text'; });
    return block ? block.text : null;
  }

  try {
    const step1 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 400,
        system: `You are an expert in digital marketing and offer strategy for online creators and coaches.

Given someone's paid offer, their audience, and their price point, identify the single best entry point into that offer.

Respond ONLY in valid JSON with no preamble, no markdown, no backticks:
{
  "entry_point": "a single clear sentence naming the best entry point",
  "entry_context": "2-3 sentences explaining why this is the right entry point, what the person is experiencing at this moment, and why solving this first makes them ready for the paid offer"
}`,
        messages: [{ role: 'user', content: userInput }]
      })
    });

    const step1Data = await step1.json();
    if (!step1.ok) throw new Error(step1Data.error?.message || 'Step 1 failed');

    const step1Text = extractText(step1Data);
    if (!step1Text) throw new Error('No text response from Step 1');

    let step1Result;
    try {
      step1Result = JSON.parse(step1Text.replace(/```json|```/g, '').trim());
    } catch {
      step1Result = { entry_point: step1Text, entry_context: '' };
    }

    const step2 = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 800,
        system: `You are an expert at designing simple, powerful AI lead-gen tools for non-technical creators and coaches.

Given someone's paid offer, their audience, and the best entry point into that offer, design a specific free AI tool they can use as a lead magnet.

Format your response exactly like this, using these exact labels:

TOOL NAME
A compelling name for the free lead-gen tool (4-8 words)

TOOL TYPE
One of: Scorer, Diagnostic, Generator, or Calculator

WHAT THE USER INPUTS
List 2-4 simple questions or fields the user fills in

WHAT THE TOOL OUTPUTS
Describe the specific personalised result the user receives — make it concrete

THE BRIDGE TO YOUR PAID OFFER
One sentence explaining how this free result naturally makes them want to buy the paid offer next

SUGGESTED CALL TO ACTION
The exact CTA line to show after the result, leading them to the paid offer`,
        messages: [{ role: 'user', content: `${userInput}\n\nBest entry point into the offer: ${step1Result.entry_point}` }]
      })
    });

    const step2Data = await step2.json();
    if (!step2.ok) throw new Error(step2Data.error?.message || 'Step 2 failed');

    const step2Text = extractText(step2Data);
    if (!step2Text) throw new Error('No text response from Step 2');

    return res.status(200).json({
      entry_point: step1Result.entry_point,
      entry_context: step1Result.entry_context,
      tool_concept: step2Text.trim()
    });

  } catch (err) {
    console.error('Lead magnet generation error:', err.message);
    return res.status(500).json({ error: err.message || 'Something went wrong. Please try again.' });
  }
}
