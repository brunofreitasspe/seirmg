// Peças de interface compartilhadas pelas ferramentas de PDF -- cada ferramenta só monta o que é
// seu (opções, pré-visualização) e reaproveita seletor de arquivos, mensagens, botões e progresso
// daqui, pra todas terem a mesma cara e o mesmo comportamento (arrastar e soltar, erros inline em
// vez de alert(), botão com estado de "processando").
import { listarFerramentasPdf } from '../../features/ferramentas-pdf/catalogo'
import { montarUrlCatalogo } from '../../features/ferramentas-pdf/catalogoUrl'
import { ICONES, ICONES_FERRAMENTA } from './icones'

export function criarElemento<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  classe?: string,
  texto?: string
): HTMLElementTagNameMap[K] {
  const elemento = document.createElement(tag)
  if (classe) elemento.className = classe
  if (texto !== undefined) elemento.textContent = texto
  return elemento
}

export function criarIcone(svg: string, classe = 'icone'): HTMLSpanElement {
  const span = criarElemento('span', classe)
  span.setAttribute('aria-hidden', 'true')
  span.innerHTML = svg
  return span
}

export function formatarBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1).replace('.', ',')} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`
}

export async function lerBytes(arquivo: File): Promise<Uint8Array> {
  return new Uint8Array(await arquivo.arrayBuffer())
}

export function baixarArquivo(conteudo: Uint8Array | string, nome: string, tipo = 'application/pdf'): void {
  const blob = new Blob([conteudo as BlobPart], { type: tipo })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  // Revogar no mesmo tick pode cancelar o download em alguns navegadores.
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ---------------------------------------------------------------------------------------------
// Estrutura da página de uma ferramenta: "voltar", cabeçalho com ícone e as etapas numeradas.

export function montarEstruturaFerramenta(container: HTMLElement, ferramentaId: string): HTMLElement {
  const ferramenta = listarFerramentasPdf().find((f) => f.id === ferramentaId)
  container.innerHTML = ''

  const voltar = criarElemento('a', 'voltar')
  voltar.href = montarUrlCatalogo(window.location.search)
  voltar.append(criarIcone(ICONES.arrowLeft), 'Todas as ferramentas')

  const cabecalho = criarElemento('header', 'ferramenta-cabecalho')
  cabecalho.dataset.grupo = ferramenta?.grupo ?? ''
  const icone = criarIcone(ICONES_FERRAMENTA[ferramentaId] ?? '', 'ferramenta-icone')
  const textos = criarElemento('div')
  textos.append(criarElemento('h1', undefined, ferramenta?.nome ?? ''), criarElemento('p', undefined, ferramenta?.descricao ?? ''))
  cabecalho.append(icone, textos)

  const corpo = criarElemento('div', 'ferramenta-corpo')
  container.append(voltar, cabecalho, corpo)
  return corpo
}

export function criarEtapa(numero: number, titulo: string): { secao: HTMLElement; corpo: HTMLDivElement } {
  const secao = criarElemento('section', 'etapa')
  const cabecalho = criarElemento('div', 'etapa-cabecalho')
  cabecalho.append(criarElemento('span', 'etapa-numero', String(numero)), criarElemento('h2', undefined, titulo))
  const corpo = criarElemento('div', 'etapa-corpo')
  secao.append(cabecalho, corpo)
  return { secao, corpo }
}

// ---------------------------------------------------------------------------------------------
// Botões

type VarianteBotao = 'primario' | 'secundario' | 'fantasma' | 'perigo'

export function criarBotao(texto: string, opcoes: { variante?: VarianteBotao; icone?: string } = {}): HTMLButtonElement {
  const botao = criarElemento('button', `btn btn-${opcoes.variante ?? 'secundario'}`)
  botao.type = 'button'
  if (opcoes.icone) botao.append(criarIcone(opcoes.icone))
  botao.append(criarElemento('span', 'btn-texto', texto))
  return botao
}

export function criarBotaoIcone(icone: string, rotulo: string): HTMLButtonElement {
  const botao = criarElemento('button', 'btn-icone')
  botao.type = 'button'
  botao.title = rotulo
  botao.setAttribute('aria-label', rotulo)
  botao.append(criarIcone(icone))
  return botao
}

// Troca o botão pra "processando" (spinner + texto) enquanto `acao` roda, e restaura no fim.
export async function comCarregando<T>(botao: HTMLButtonElement, textoCarregando: string, acao: () => Promise<T>): Promise<T> {
  const texto = botao.querySelector('.btn-texto')
  const textoOriginal = texto?.textContent ?? ''
  const iconeOriginal = botao.querySelector('.icone')
  const spinner = criarIcone(ICONES.loader, 'icone girando')
  botao.disabled = true
  botao.classList.add('carregando')
  if (iconeOriginal) iconeOriginal.replaceWith(spinner)
  else botao.prepend(spinner)
  if (texto) texto.textContent = textoCarregando
  try {
    return await acao()
  } finally {
    botao.disabled = false
    botao.classList.remove('carregando')
    if (iconeOriginal) spinner.replaceWith(iconeOriginal)
    else spinner.remove()
    if (texto) texto.textContent = textoOriginal
  }
}

export function criarBarraAcoes(...filhos: HTMLElement[]): HTMLDivElement {
  const barra = criarElemento('div', 'barra-acoes')
  barra.append(...filhos)
  return barra
}

// ---------------------------------------------------------------------------------------------
// Mensagens inline (substituem alert())

export type TipoMensagem = 'erro' | 'sucesso' | 'info' | 'aviso'

const ICONE_MENSAGEM: Record<TipoMensagem, string> = {
  erro: ICONES.circleX,
  sucesso: ICONES.circleCheck,
  info: ICONES.info,
  aviso: ICONES.triangleAlert,
}

export interface Mensagem {
  elemento: HTMLDivElement
  mostrar: (tipo: TipoMensagem, texto: string) => void
  limpar: () => void
}

export function criarMensagem(): Mensagem {
  const elemento = criarElemento('div', 'mensagem')
  elemento.hidden = true
  elemento.setAttribute('role', 'status')
  return {
    elemento,
    mostrar: (tipo, texto) => {
      elemento.className = `mensagem mensagem-${tipo}`
      elemento.replaceChildren(criarIcone(ICONE_MENSAGEM[tipo]), criarElemento('span', undefined, texto))
      elemento.hidden = false
    },
    limpar: () => {
      elemento.hidden = true
      elemento.replaceChildren()
    },
  }
}

export function criarAviso(tipo: TipoMensagem, conteudo: string | Node): HTMLDivElement {
  const aviso = criarElemento('div', `mensagem mensagem-${tipo}`)
  const texto = criarElemento('div')
  texto.append(conteudo)
  aviso.append(criarIcone(ICONE_MENSAGEM[tipo]), texto)
  return aviso
}

// ---------------------------------------------------------------------------------------------
// Progresso

export interface Progresso {
  elemento: HTMLDivElement
  definir: (fracao: number, texto: string) => void
  ocultar: () => void
}

export function criarProgresso(): Progresso {
  const elemento = criarElemento('div', 'progresso')
  elemento.hidden = true
  const texto = criarElemento('div', 'progresso-texto')
  const trilho = criarElemento('div', 'progresso-trilho')
  const barra = criarElemento('div', 'progresso-barra')
  trilho.append(barra)
  elemento.append(texto, trilho)
  return {
    elemento,
    definir: (fracao, rotulo) => {
      elemento.hidden = false
      texto.textContent = rotulo
      barra.style.width = `${Math.round(Math.min(1, Math.max(0, fracao)) * 100)}%`
    },
    ocultar: () => {
      elemento.hidden = true
    },
  }
}

// ---------------------------------------------------------------------------------------------
// Seletor de arquivos: zona de clicar-ou-arrastar + lista dos escolhidos (opcionalmente
// reordenável). Em modo múltiplo, novas escolhas se somam às anteriores em vez de substituí-las.

export interface OpcoesSeletorArquivos {
  aceitar: string // mesmo formato do atributo accept, ex.: 'application/pdf' ou 'image/png,image/jpeg'
  multiplo?: boolean
  ordenavel?: boolean
  titulo: string
  dica: string
}

export interface SeletorArquivos {
  elemento: HTMLDivElement
  obterArquivos: () => File[]
  aoMudar: (callback: (arquivos: File[]) => void) => void
}

function arquivoAceito(arquivo: File, aceitar: string): boolean {
  return aceitar.split(',').some((tipo) => {
    const t = tipo.trim().toLowerCase()
    if (t.startsWith('.')) return arquivo.name.toLowerCase().endsWith(t)
    if (t.endsWith('/*')) return arquivo.type.startsWith(t.slice(0, -1))
    return arquivo.type === t
  })
}

export function criarSeletorArquivos(opcoes: OpcoesSeletorArquivos): SeletorArquivos {
  let arquivos: File[] = []
  const callbacks: Array<(arquivos: File[]) => void> = []

  const elemento = criarElemento('div', 'seletor')
  const zona = criarElemento('label', 'zona-soltar')
  const input = criarElemento('input')
  input.type = 'file'
  input.accept = opcoes.aceitar
  input.multiple = Boolean(opcoes.multiplo)
  input.className = 'visualmente-oculto'
  const textos = criarElemento('div', 'zona-textos')
  const titulo = criarElemento('strong', undefined, opcoes.titulo)
  const dica = criarElemento('span', undefined, opcoes.dica)
  textos.append(titulo, dica)
  zona.append(input, criarIcone(ICONES.upload, 'zona-icone'), textos)

  const lista = criarElemento('ul', 'lista-arquivos')
  const recusados = criarMensagem()
  elemento.append(zona, recusados.elemento, lista)

  function notificar(): void {
    renderizar()
    callbacks.forEach((callback) => callback([...arquivos]))
  }

  function adicionar(novos: File[]): void {
    const aceitos = novos.filter((arquivo) => arquivoAceito(arquivo, opcoes.aceitar))
    const qtdRecusados = novos.length - aceitos.length
    if (qtdRecusados > 0) {
      recusados.mostrar('aviso', `${qtdRecusados} arquivo(s) ignorado(s) por não ser(em) do tipo aceito.`)
    } else {
      recusados.limpar()
    }
    if (aceitos.length === 0) return
    arquivos = opcoes.multiplo ? [...arquivos, ...aceitos] : [aceitos[0]]
    notificar()
  }

  function mover(indice: number, destino: number): void {
    if (destino < 0 || destino >= arquivos.length) return
    ;[arquivos[indice], arquivos[destino]] = [arquivos[destino], arquivos[indice]]
    notificar()
  }

  function renderizar(): void {
    lista.replaceChildren()
    zona.classList.toggle('compacta', arquivos.length > 0)
    titulo.textContent = arquivos.length > 0 ? (opcoes.multiplo ? 'Adicionar mais arquivos' : 'Trocar arquivo') : opcoes.titulo
    arquivos.forEach((arquivo, indice) => {
      const item = criarElemento('li', 'arquivo')
      if (opcoes.ordenavel && arquivos.length > 1) item.append(criarElemento('span', 'arquivo-ordem', String(indice + 1)))
      item.append(criarIcone(ICONES.fileText, 'arquivo-icone'))
      const nome = criarElemento('div', 'arquivo-info')
      nome.append(criarElemento('span', 'arquivo-nome', arquivo.name), criarElemento('span', 'arquivo-tamanho', formatarBytes(arquivo.size)))
      item.append(nome)

      const acoes = criarElemento('div', 'arquivo-acoes')
      if (opcoes.ordenavel && arquivos.length > 1) {
        const subir = criarBotaoIcone(ICONES.chevronUp, `Mover ${arquivo.name} para cima`)
        subir.disabled = indice === 0
        subir.addEventListener('click', () => mover(indice, indice - 1))
        const descer = criarBotaoIcone(ICONES.chevronDown, `Mover ${arquivo.name} para baixo`)
        descer.disabled = indice === arquivos.length - 1
        descer.addEventListener('click', () => mover(indice, indice + 1))
        acoes.append(subir, descer)
      }
      const remover = criarBotaoIcone(ICONES.x, `Remover ${arquivo.name}`)
      remover.addEventListener('click', () => {
        arquivos = arquivos.filter((_, i) => i !== indice)
        notificar()
      })
      acoes.append(remover)
      item.append(acoes)
      lista.append(item)
    })
  }

  input.addEventListener('change', () => {
    adicionar(Array.from(input.files ?? []))
    input.value = '' // permite escolher o mesmo arquivo de novo depois de removê-lo
  })

  zona.addEventListener('dragover', (evento) => {
    evento.preventDefault()
    zona.classList.add('arrastando')
  })
  zona.addEventListener('dragleave', () => zona.classList.remove('arrastando'))
  zona.addEventListener('drop', (evento) => {
    evento.preventDefault()
    zona.classList.remove('arrastando')
    adicionar(Array.from(evento.dataTransfer?.files ?? []))
  })

  return {
    elemento,
    obterArquivos: () => [...arquivos],
    aoMudar: (callback) => callbacks.push(callback),
  }
}

// ---------------------------------------------------------------------------------------------
// Campos de formulário

export function criarCampo(rotulo: string, controle: HTMLElement, ajuda?: string): HTMLLabelElement {
  const campo = criarElemento('label', 'campo')
  campo.append(criarElemento('span', 'campo-rotulo', rotulo), controle)
  if (ajuda) campo.append(criarElemento('span', 'campo-ajuda', ajuda))
  return campo
}

// Grupo de opções exclusivas com cara de "segmented control".
export function criarSegmentado<T extends string>(
  nome: string,
  opcoes: Array<{ valor: T; rotulo: string }>,
  inicial: T
): { elemento: HTMLDivElement; valor: () => T } {
  const elemento = criarElemento('div', 'segmentado')
  elemento.setAttribute('role', 'radiogroup')
  for (const opcao of opcoes) {
    const rotulo = criarElemento('label', 'segmento')
    const radio = criarElemento('input')
    radio.type = 'radio'
    radio.name = nome
    radio.value = opcao.valor
    radio.checked = opcao.valor === inicial
    rotulo.append(radio, criarElemento('span', undefined, opcao.rotulo))
    elemento.append(rotulo)
  }
  return {
    elemento,
    valor: () => (elemento.querySelector<HTMLInputElement>('input:checked')?.value ?? inicial) as T,
  }
}

// "Ofício 123.pdf" -> "Ofício 123" -- base pros nomes dos arquivos gerados (viram também o nome
// do documento no SEI quando enviados ao processo).
export function nomeBase(arquivo: File): string {
  return arquivo.name.replace(/\.[^.]+$/, '') || 'documento'
}

export function rotuloPaginas(total: number): string {
  return total === 1 ? '1 página' : `${total} páginas`
}
