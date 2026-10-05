import { describe, it, expect } from 'vitest'
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib'
import { diagnosticarPdfA } from './pdfa'

describe('diagnosticarPdfA', () => {
  it('nunca afirma conformidade -- sempre retorna "indeterminado"', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    expect(diagnostico.conforme).toBe('indeterminado')
  })

  it('aponta ausência de metadados XMP', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    const chaves = diagnostico.verificacoes.map((v) => v.chave)
    expect(chaves).toContain('metadados-xmp')
    expect(diagnostico.verificacoes.find((v) => v.chave === 'metadados-xmp')?.ok).toBe(false)
  })

  it('reconhece metadados XMP quando o catálogo tem uma entrada /Metadata', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    // pdf-lib não expõe API de alto nível pra escrever XMP; simulamos a entrada
    // /Metadata do catálogo diretamente via API de baixo nível (context), que é
    // exatamente o que diagnosticarPdfA verifica (presença da entrada, não o
    // conteúdo RDF/XML em si -- essa é uma checagem necessária, não suficiente).
    const streamMetadados = doc.context.stream('<x:xmpmeta></x:xmpmeta>', {
      Type: 'Metadata',
      Subtype: 'XML',
    })
    const refMetadados = doc.context.register(streamMetadados)
    doc.catalog.set(PDFName.of('Metadata'), refMetadados)
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    expect(diagnostico.verificacoes.find((v) => v.chave === 'metadados-xmp')?.ok).toBe(true)
  })

  it('aponta fonte não embutida ao usar uma fonte padrão (Type1 sem FontDescriptor)', async () => {
    const doc = await PDFDocument.create()
    const pagina = doc.addPage()
    const fonte = await doc.embedFont(StandardFonts.Helvetica)
    pagina.drawText('oi', { font: fonte })
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    const verificacao = diagnostico.verificacoes.find((v) => v.chave === 'fontes-embutidas')
    expect(verificacao?.ok).toBe(false)
  })

  it('não aponta falha de fonte quando o documento não usa nenhuma fonte', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    const verificacao = diagnostico.verificacoes.find((v) => v.chave === 'fontes-embutidas')
    expect(verificacao?.ok).toBe(true)
  })

  it('reconhece ausência de criptografia em um PDF comum', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    const verificacao = diagnostico.verificacoes.find((v) => v.chave === 'sem-criptografia')
    expect(verificacao?.ok).toBe(true)
  })

  it('aponta criptografia quando o trailer tem uma entrada /Encrypt', async () => {
    const doc = await PDFDocument.create()
    doc.addPage()
    // pdf-lib não tem API pública pra gerar um PDF criptografado de verdade (não
    // implementa o handler de segurança padrão na escrita); simulamos a detecção
    // via a mesma entrada que o pdf-lib usa internamente pra marcar isEncrypted:
    // a referência /Encrypt do trailer apontando pra um dicionário resolvível.
    const dicionarioEncrypt = doc.context.obj({ Filter: 'Standard' })
    const refEncrypt = doc.context.register(dicionarioEncrypt)
    doc.context.trailerInfo.Encrypt = refEncrypt
    const bytes = await doc.save()

    const diagnostico = await diagnosticarPdfA(bytes)
    const verificacao = diagnostico.verificacoes.find((v) => v.chave === 'sem-criptografia')
    expect(verificacao?.ok).toBe(false)
  })
})
