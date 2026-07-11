import type { ProvedorIA } from '../../lib/storage'

export interface RequisicaoIA {
  url: string
  method: string
  headers: Record<string, string>
  body: string
}

export function montarRequisicao(
  provedor: ProvedorIA,
  modelo: string,
  prompt: string,
  apiKey: string
): RequisicaoIA {
  if (provedor === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: modelo, messages: [{ role: 'user', content: prompt }] }),
    }
  }

  if (provedor === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${modelo}:generateContent?key=${apiKey}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  }

  return {
    url: 'https://api.anthropic.com/v1/messages',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: modelo, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] }),
  }
}

interface RespostaOpenAI {
  choices?: Array<{ message?: { content?: string } }>
}
interface RespostaGemini {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}
interface RespostaClaude {
  content?: Array<{ text?: string }>
}

export function extrairResposta(provedor: ProvedorIA, corpoResposta: string): string | null {
  try {
    const json: unknown = JSON.parse(corpoResposta)

    if (provedor === 'openai') {
      return (json as RespostaOpenAI).choices?.[0]?.message?.content ?? null
    }
    if (provedor === 'gemini') {
      return (json as RespostaGemini).candidates?.[0]?.content?.parts?.[0]?.text ?? null
    }
    return (json as RespostaClaude).content?.[0]?.text ?? null
  } catch {
    return null
  }
}
