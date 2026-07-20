export function extrairUrlEdicaoProcesso(headHtml: string): string | null {
  const marcadores = [
    'controlador.php?acao=procedimento_alterar&',
    'controlador.php?acao=procedimento_consultar&',
  ]
  for (const marcador of marcadores) {
    const inicio = headHtml.indexOf(marcador)
    if (inicio === -1) continue
    const fim = headHtml.indexOf('"', inicio)
    if (fim === -1) continue
    return headHtml.substring(inicio, fim)
  }
  return null
}

export function extrairTipoProcesso(doc: Document): string {
  return doc.querySelector("#selTipoProcedimento option[selected='selected']")?.textContent?.trim() ?? ''
}

export interface InteressadoExtraido {
  id: string
  nome: string
  sigla: string
}

export function extrairInteressados(doc: Document): InteressadoExtraido[] {
  return Array.from(doc.querySelectorAll('#selInteressadosProcedimento option')).map((option) => {
    const texto = option.textContent ?? ''
    const match = /^(.*) \((.*)\)$/.exec(texto)
    return {
      id: option.getAttribute('value') ?? '',
      nome: (match?.[1] ?? texto).trim(),
      sigla: (match?.[2] ?? '').trim(),
    }
  })
}

export function obterUnidadeAtual(seiVersionAtLeast4: boolean, doc: Document): string | null {
  if (seiVersionAtLeast4) {
    return doc.querySelector('#lnkInfraUnidade')?.textContent?.trim() || null
  }
  const select = doc.querySelector<HTMLSelectElement>("select[name='selInfraUnidades']")
  return select?.selectedOptions[0]?.textContent?.trim() || null
}

export interface UsuarioAtribuicao {
  nome: string
  login: string
}

export interface DadosAtribuicao {
  sigiloso: boolean
  usuarios: UsuarioAtribuicao[]
  mais?: number
}

export function extrairAtribuicao(scriptHtml: string, unidadeAtual: string): DadosAtribuicao | null {
  if (!/^Nos\[0\]\.html = 'Processo aberto/m.test(scriptHtml)) return null

  const rConteudo = /^Nos\[0\]\.html = '(.*)';/m.exec(scriptHtml)
  if (!rConteudo) return null
  const html = rConteudo[1]

  if (/(Processo aberto nas unidades:|Processo aberto somente na unidade)/m.test(html)) {
    const regexUnidade = new RegExp(
      String.raw`(?<=<a alt=".*" title=".*" class="ancoraSigla">)${unidadeAtual}<\/a>(.*?)[.]?<br \/>`,
      'm'
    )
    const resultadoUnidade = regexUnidade.exec(html)
    if (!resultadoUnidade) return null

    const regexUsuario = /\(atribuído para <a alt=".*" title="(.*?)" class="ancoraSigla">(.*?)<\/a>\)/m
    const resultadoUsuario = regexUsuario.exec(resultadoUnidade[1])
    if (!resultadoUsuario) return { sigiloso: false, usuarios: [] }
    return { sigiloso: false, usuarios: [{ nome: resultadoUsuario[1], login: resultadoUsuario[2] }] }
  }

  if (/(Processo aberto com os usuários:|Processo aberto somente com o usuário)/m.test(html)) {
    const regex =
      /(?<=<a alt=".*?" title="(.*?)" class="ancoraSigla">(.*?))(?=<\/a>&nbsp;\/&nbsp;<a alt=".*?" title=".*?" class="ancoraSigla">(.*?)<\/a>)/g
    const usuarios: UsuarioAtribuicao[] = []
    let mais = 0
    let m: RegExpExecArray | null
    while ((m = regex.exec(html)) !== null) {
      if (m.index === regex.lastIndex) regex.lastIndex++
      const [, nome, login, unidade] = m
      if (unidade === unidadeAtual) {
        usuarios.push({ nome, login })
      } else {
        mais++
      }
    }
    return { sigiloso: true, usuarios, mais }
  }

  return null
}

export interface NivelAcessoExtraido {
  nivel: 'Público' | 'Restrito' | 'Sigiloso' | ''
  hipoteseLegal: string | null
}

export function extrairNivelAcesso(doc: Document): NivelAcessoExtraido {
  const valor = doc.querySelector<HTMLInputElement>('input[name="rdoNivelAcesso"]:checked')?.value

  if (valor === '0') return { nivel: 'Público', hipoteseLegal: null }
  if (valor === '2') return { nivel: 'Sigiloso', hipoteseLegal: null }
  if (valor === '1') {
    const hipotese = doc.querySelector<HTMLSelectElement>('#selHipoteseLegal')?.selectedOptions[0]?.textContent?.trim()
    return { nivel: 'Restrito', hipoteseLegal: hipotese || null }
  }
  return { nivel: '', hipoteseLegal: null }
}

export function extrairAssuntos(doc: Document): string[] {
  return Array.from(doc.querySelectorAll('#selAssuntos option'))
    .map((option) => option.textContent?.trim() ?? '')
    .filter((texto) => texto !== '')
}

export function extrairObservacao(doc: Document): string {
  return doc.querySelector<HTMLTextAreaElement>('#txaObservacoes')?.value.trim() ?? ''
}

export function extrairEspecificacao(doc: Document): string {
  return doc.querySelector<HTMLInputElement>('#txtDescricao')?.value.trim() ?? ''
}
