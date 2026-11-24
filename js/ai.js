// Prompt builder for "copy for AI" and an optional OpenAI-compatible request.

export function buildPrompt(prompts, taskId, input, fallbackInput) {
  const task = prompts.tasks.find((t) => t.id === taskId) || prompts.tasks[0];
  const body = (input || '').trim() || fallbackInput || prompts.fallbackInput;
  return `${prompts.preamble}\n\n${task.instruction}\n${body}`;
}

export async function askModel({ endpoint, model, key, prompt }) {
  const headers = { 'Content-Type': 'application/json' };
  if (key) headers.Authorization = `Bearer ${key}`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify({ model: model || 'local-model', messages: [{ role: 'user', content: prompt }], temperature: 0.3 }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const json = await res.json();
  return json.choices?.[0]?.message?.content || JSON.stringify(json, null, 2);
}
