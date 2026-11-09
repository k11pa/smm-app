import { ChatResult, ProviderId } from '../shared'
import { getKey, getSettings } from './store'

// One entry point for every AI provider. The key never leaves the main process.
export async function chat(prompt: string, system = '', override?: { provider: ProviderId; model: string }): Promise<ChatResult> {
  const { ai } = getSettings()
  const provider = override?.provider ?? ai.provider
  const model = override?.model ?? ai.model
  const key = getKey(provider)
  if (!key) return { ok: false, error: 'NO_KEY' }

  try {
    if (provider === 'anthropic') {
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model, max_tokens: 2048, system: system || undefined, messages: [{ role: 'user', content: prompt }] })
      })
      const j: any = await r.json()
      if (!r.ok) return { ok: false, error: j?.error?.message ?? `HTTP ${r.status}` }
      return { ok: true, text: j.content?.map((c: any) => c.text ?? '').join('') }
    }
    if (provider === 'openai') {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [...(system ? [{ role: 'system', content: system }] : []), { role: 'user', content: prompt }]
        })
      })
      const j: any = await r.json()
      if (!r.ok) return { ok: false, error: j?.error?.message ?? `HTTP ${r.status}` }
      return { ok: true, text: j.choices?.[0]?.message?.content ?? '' }
    }
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
      })
    })
    const j: any = await r.json()
    if (!r.ok) return { ok: false, error: j?.error?.message ?? `HTTP ${r.status}` }
    return { ok: true, text: j.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('') ?? '' }
  } catch (e: any) {
    return { ok: false, error: e?.message ?? String(e) }
  }
}
