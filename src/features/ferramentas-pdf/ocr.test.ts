import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createWorker } from 'tesseract.js'
import { montarTextoPorPagina, criarReconhecedorOcr } from './ocr'

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }))

describe('montarTextoPorPagina', () => {
  it('junta o texto de cada página com cabeçalho de página', () => {
    const resultado = montarTextoPorPagina(['Texto da página 1', 'Texto da página 2'])
    expect(resultado).toBe('--- Página 1 ---\nTexto da página 1\n\n--- Página 2 ---\nTexto da página 2')
  })

  it('lista vazia devolve string vazia', () => {
    expect(montarTextoPorPagina([])).toBe('')
  })
})

describe('criarReconhecedorOcr', () => {
  const recognize = vi.fn()
  const terminate = vi.fn()

  beforeEach(() => {
    vi.resetAllMocks()
    vi.stubGlobal('chrome', { runtime: { getURL: (caminho: string) => `chrome-extension://abc/${caminho}` } })
    recognize.mockResolvedValue({ data: { text: 'texto reconhecido' } })
    vi.mocked(createWorker).mockResolvedValue({ recognize, terminate } as unknown as Tesseract.Worker)
  })

  // A CSP do MV3 bloqueia código remoto: worker e core (JS+WASM) precisam vir de dentro da
  // extensão, e o worker não pode ser criado via blob: (padrão do tesseract.js).
  it('carrega worker e core empacotados na extensão, sem blob: nem CDN', async () => {
    await criarReconhecedorOcr()
    const opcoes = vi.mocked(createWorker).mock.calls[0][2]
    expect(opcoes).toMatchObject({
      workerPath: 'chrome-extension://abc/tesseract/worker.min.js',
      corePath: 'chrome-extension://abc/tesseract/',
      workerBlobURL: false,
    })
  })

  it('reaproveita um único worker pra todas as páginas e só encerra no fim', async () => {
    const reconhecedor = await criarReconhecedorOcr()
    expect(await reconhecedor.reconhecer(new Uint8Array([1]))).toBe('texto reconhecido')
    await reconhecedor.reconhecer(new Uint8Array([2]))
    expect(createWorker).toHaveBeenCalledTimes(1)
    expect(terminate).not.toHaveBeenCalled()
    await reconhecedor.encerrar()
    expect(terminate).toHaveBeenCalledTimes(1)
  })

  it('repassa o progresso do reconhecimento (0..1) pro chamador', async () => {
    const progressos: number[] = []
    await criarReconhecedorOcr((p) => progressos.push(p))
    const logger = vi.mocked(createWorker).mock.calls[0][2]?.logger
    logger?.({ status: 'recognizing text', progress: 0.5, jobId: 'x', userJobId: 'x', workerId: 'w' })
    logger?.({ status: 'loading language traineddata', progress: 0.3, jobId: 'x', userJobId: 'x', workerId: 'w' })
    expect(progressos).toEqual([0.5])
  })
})
