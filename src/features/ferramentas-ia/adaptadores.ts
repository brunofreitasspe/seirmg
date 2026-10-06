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
    // Thinking (sempre ligado nos modelos atuais) consome o mesmo orçamento: 1024 cortava a resposta.
    body: JSON.stringify({ model: modelo, max_tokens: 8000, messages: [{ role: 'user', content: prompt }] }),
  }
}

interface RespostaOpenAI {
  choices?: Array<{ message?: { content?: string } }>
}
interface RespostaGemini {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
}
interface RespostaClaude {
  content?: Array<{ type?: string; text?: string }>
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
    // Modelos atuais devolvem um bloco de thinking antes do texto -- junta só os blocos de texto.
    const textos = ((json as RespostaClaude).content ?? [])
      .filter((bloco) => (bloco.type === undefined || bloco.type === 'text') && typeof bloco.text === 'string')
      .map((bloco) => bloco.text as string)
    return textos.length > 0 ? textos.join('\n') : null
  } catch {
    return null
  }
}
