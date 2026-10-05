import { PDFDict, PDFDocument, PDFName } from 'pdf-lib'

export interface VerificacaoPdfA {
  chave: string
  titulo: string
  ok: boolean
  explicacao: string
}

export interface DiagnosticoPdfA {
  // Nunca "true" nem "false" -- essas checagens são necessárias, não suficientes;
  // a referência de verdade é o veraPDF, que não roda no navegador.
  conforme: 'indeterminado'
  verificacoes: VerificacaoPdfA[]
}

const NOME_METADATA = PDFName.of('Metadata')
const NOME_SUBTYPE = PDFName.of('Subtype')
const NOME_FONT_DESCRIPTOR = PDFName.of('FontDescriptor')
const NOME_BASE_FONT = PDFName.of('BaseFont')
const SUBTIPOS_FONTE_SIMPLES = [PDFName.of('Type1'), PDFName.of('TrueType')]
const NOMES_ARQUIVO_FONTE = [PDFName.of('FontFile'), PDFName.of('FontFile2'), PDFName.of('FontFile3')]

export async function diagnosticarPdfA(arquivo: Uint8Array): Promise<DiagnosticoPdfA> {
  // ignoreEncryption: true -- senão o próprio PDFDocument.load lança
  // EncryptedPDFError pra PDFs criptografados, e a checagem de criptografia
  // (que depende de carregar o documento) nunca chegaria a rodar.
  const doc = await PDFDocument.load(arquivo, { ignoreEncryption: true })

  const temMetadadosXmp = doc.catalog.has(NOME_METADATA)
  const fonteNaoEmbutida = encontrarFonteNaoEmbutida(doc)
  const semCriptografia = !doc.isEncrypted

  const verificacoes: VerificacaoPdfA[] = [
    {
      chave: 'metadados-xmp',
      titulo: 'Metadados XMP',
      ok: temMetadadosXmp,
      explicacao: temMetadadosXmp
        ? 'O arquivo tem uma entrada /Metadata no catálogo.'
        : 'PDF/A exige um bloco de metadados XMP (título, autor, datas) em RDF/XML no catálogo do documento. Ferramentas de PDF comuns não geram isso por padrão.',
    },
    {
      chave: 'fontes-embutidas',
      titulo: 'Fontes embutidas',
      ok: fonteNaoEmbutida === undefined,
      explicacao:
        fonteNaoEmbutida !== undefined
          ? `A fonte "${fonteNaoEmbutida}" é usada no documento mas não está embutida (sem FontFile/FontFile2/FontFile3 no descritor). PDF/A exige que todas as fontes usadas -- inclusive as 14 fontes padrão -- estejam embutidas no arquivo.`
          : 'Não foram encontradas fontes Type1/TrueType referenciadas sem arquivo de fonte embutido.',
    },
    {
      chave: 'sem-criptografia',
      titulo: 'Ausência de criptografia',
      ok: semCriptografia,
      explicacao: semCriptografia
        ? 'O arquivo não está criptografado.'
        : 'PDF/A não permite criptografia ou controles de acesso no arquivo. É preciso remover a senha/proteção antes de buscar conformidade com PDF/A.',
    },
  ]

  return { conforme: 'indeterminado', verificacoes }
}

/**
 * Procura, entre os objetos indiretos do documento, um dicionário de fonte
 * simples (/Subtype /Type1 ou /TrueType) cujo /FontDescriptor não exista ou
 * não tenha nenhuma das chaves de arquivo de fonte embutido (/FontFile,
 * /FontFile2, /FontFile3). Retorna o nome da fonte (/BaseFont) encontrada,
 * ou undefined se nenhuma fonte não embutida foi encontrada.
 */
function encontrarFonteNaoEmbutida(doc: PDFDocument): string | undefined {
  for (const [, objeto] of doc.context.enumerateIndirectObjects()) {
    if (!(objeto instanceof PDFDict)) continue

    const subtipo = objeto.lookupMaybe(NOME_SUBTYPE, PDFName)
    if (!subtipo || !SUBTIPOS_FONTE_SIMPLES.includes(subtipo)) continue

    const descritor = objeto.lookupMaybe(NOME_FONT_DESCRIPTOR, PDFDict)
    const temArquivoEmbutido = descritor !== undefined && NOMES_ARQUIVO_FONTE.some((nome) => descritor.has(nome))
    if (temArquivoEmbutido) continue

    const baseFont = objeto.lookupMaybe(NOME_BASE_FONT, PDFName)
    return baseFont ? baseFont.asString().replace(/^\//, '') : 'desconhecida'
  }

  return undefined
}
