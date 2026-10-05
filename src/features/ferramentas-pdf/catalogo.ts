export interface FerramentaPdf {
  id: string
  nome: string
  descricao: string
}

const FERRAMENTAS: FerramentaPdf[] = [
  { id: 'juntar', nome: 'Juntar PDFs', descricao: 'Une vários PDFs em um único arquivo, na ordem escolhida.' },
  { id: 'dividir', nome: 'Dividir PDF', descricao: 'Separa um PDF em vários arquivos, por página ou por intervalo.' },
  { id: 'organizar', nome: 'Organizar páginas', descricao: 'Reordena ou remove páginas de um PDF.' },
  { id: 'numerar-paginas', nome: 'Numerar páginas', descricao: 'Adiciona numeração sequencial no canto de cada página.' },
  { id: 'imagem-para-pdf', nome: 'Imagem → PDF', descricao: 'Converte uma ou mais imagens (JPG/PNG) em um PDF.' },
  { id: 'comprimir', nome: 'Comprimir PDF', descricao: 'Reduz o tamanho do arquivo recomprimindo as imagens internas.' },
  { id: 'ocr', nome: 'OCR', descricao: 'Reconhece texto em PDFs escaneados (imagem), tornando-os pesquisáveis.' },
  { id: 'pdfa', nome: 'Diagnóstico PDF/A', descricao: 'Confere o que falta pro arquivo ser aceito como PDF/A e explica por quê.' },
  {
    id: 'tarjar',
    nome: 'Tarjar (sigilo)',
    descricao: 'Cobre com retângulo preto opaco trechos sigilosos de um PDF, com sugestão automática de CPF/CNPJ.',
  },
]

export function listarFerramentasPdf(): FerramentaPdf[] {
  return FERRAMENTAS
}
