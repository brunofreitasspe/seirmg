export type GrupoFerramentaPdf = 'montar' | 'converter' | 'proteger'

export interface FerramentaPdf {
  id: string
  nome: string
  descricao: string
  grupo: GrupoFerramentaPdf
}

export const GRUPOS_FERRAMENTAS_PDF: Array<{ id: GrupoFerramentaPdf; titulo: string }> = [
  { id: 'montar', titulo: 'Montar e organizar' },
  { id: 'converter', titulo: 'Converter e otimizar' },
  { id: 'proteger', titulo: 'Conferir e proteger' },
]

const FERRAMENTAS: FerramentaPdf[] = [
  { id: 'juntar', grupo: 'montar', nome: 'Juntar PDFs', descricao: 'Une vários PDFs em um único arquivo, na ordem escolhida.' },
  { id: 'dividir', grupo: 'montar', nome: 'Dividir PDF', descricao: 'Separa um PDF em vários arquivos: por intervalo, por página ou por tamanho máximo.' },
  { id: 'organizar', grupo: 'montar', nome: 'Organizar páginas', descricao: 'Reordena ou remove páginas de um PDF, vendo as miniaturas.' },
  { id: 'numerar-paginas', grupo: 'montar', nome: 'Numerar páginas', descricao: 'Adiciona numeração sequencial no rodapé de cada página.' },
  { id: 'imagem-para-pdf', grupo: 'converter', nome: 'Imagem → PDF', descricao: 'Converte uma ou mais imagens (JPG/PNG) em um PDF.' },
  {
    id: 'comprimir',
    grupo: 'converter',
    nome: 'Comprimir PDF',
    descricao: 'Reduz o tamanho reorganizando a estrutura interna do arquivo, sem perder qualidade.',
  },
  { id: 'ocr', grupo: 'converter', nome: 'OCR', descricao: 'Reconhece o texto de PDFs escaneados pra você copiar ou salvar.' },
  { id: 'pdfa', grupo: 'proteger', nome: 'Diagnóstico PDF/A', descricao: 'Confere o que falta pro arquivo ser aceito como PDF/A e explica por quê.' },
  {
    id: 'tarjar',
    grupo: 'proteger',
    nome: 'Tarjar (sigilo)',
    descricao: 'Cobre com retângulo preto opaco trechos sigilosos de um PDF, com sugestão automática de CPF/CNPJ.',
  },
]

export function listarFerramentasPdf(): FerramentaPdf[] {
  return FERRAMENTAS
}
