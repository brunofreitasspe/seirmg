import { describe, expect, it } from 'vitest'
import { extrairResposta, montarRequisicao } from './adaptadores'

describe('montarRequisicao', () => {
  it('monta requisição da OpenAI com Authorization Bearer', () => {
    const req = montarRequisicao('openai', 'gpt-4o-mini', 'Olá', 'sk-teste')
    expect(req.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(req.method).toBe('POST')
    expect(req.headers.Authorization).toBe('Bearer sk-teste')
    expect(JSON.parse(req.body)).toEqual({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: 'Olá' }],
    })
  })

  it('monta requisição do Gemini com a chave na URL', () => {
    const req = montarRequisicao('gemini', 'gemini-2.0-flash', 'Olá', 'chave-teste')
    expect(req.url).toBe(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=chave-teste'
    )
    expect(req.headers.Authorization).toBeUndefined()
    expect(JSON.parse(req.body)).toEqual({ contents: [{ parts: [{ text: 'Olá' }] }] })
  })

  it('monta requisição do Claude com x-api-key e anthropic-version', () => {
    const req = montarRequisicao('claude', 'claude-opus-5-5', 'Olá', 'sk-ant-teste')
    expect(req.url).toBe('https://api.anthropic.com/v1/messages')
    expect(req.headers['x-api-key']).toBe('sk-ant-teste')
    expect(req.headers['anthropic-version']).toBe('2023-06-01')
    expect(JSON.parse(req.body)).toEqual({
      model: 'claude-opus-5-5',
      // thinking sempre ligado nos modelos atuais sai do mesmo orçamento -- 1024 cortava a resposta
      max_tokens: 8000,
      messages: [{ role: 'user', content: 'Olá' }],
    })
  })
})

describe('extrairResposta', () => {
  it('extrai o texto da resposta da OpenAI', () => {
    const corpo = JSON.stringify({ choices: [{ message: { content: 'Resposta da OpenAI' } }] })
    expect(extrairResposta('openai', corpo)).toBe('Resposta da OpenAI')
  })

  it('extrai o texto da resposta do Gemini', () => {
    const corpo = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Resposta do Gemini' }] } }] })
    expect(extrairResposta('gemini', corpo)).toBe('Resposta do Gemini')
  })

  it('extrai o texto da resposta do Claude', () => {
    const corpo = JSON.stringify({ content: [{ text: 'Resposta do Claude' }] })
    expect(extrairResposta('claude', corpo)).toBe('Resposta do Claude')
  })

  // Modelos atuais (ex.: Opus 5.5) sempre devolvem um bloco de thinking antes do texto.
  it('ignora blocos de thinking e junta os blocos de texto do Claude', () => {
    const corpo = JSON.stringify({
      content: [
        { type: 'thinking', thinking: '', signature: 'abc' },
        { type: 'text', text: 'Parte 1.' },
        { type: 'text', text: 'Parte 2.' },
      ],
    })
    expect(extrairResposta('claude', corpo)).toBe('Parte 1.\nParte 2.')
  })

  it('Claude sem bloco de texto devolve null', () => {
    expect(extrairResposta('claude', JSON.stringify({ content: [{ type: 'thinking', thinking: '' }] }))).toBeNull()
  })

  it('retorna null quando o corpo não tem o formato esperado', () => {
    expect(extrairResposta('openai', JSON.stringify({ erro: 'algo deu errado' }))).toBeNull()
  })

  it('retorna null quando o corpo não é JSON válido', () => {
    expect(extrairResposta('openai', 'não é json')).toBeNull()
  })
})
