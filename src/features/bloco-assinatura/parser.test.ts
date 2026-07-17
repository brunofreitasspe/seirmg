import { beforeEach, describe, expect, it } from 'vitest'
import {
  detectarTransicoesParaDisponibilizado,
  parseBlocoAssinaturaTable,
  parseListaBlocosAssinatura,
  resumirBlocos,
  type BlocoListaItem,
} from './parser'

function montarLinha(celulas: string[]): string {
  return `<tr>${celulas.map((c) => `<td>${c}</td>`).join('')}</tr>`
}

function montarTabelaV4(linhasDados: string[]): string {
  const cabecalho = montarLinha(['', 'Nº', 'Tipo', 'Data', 'Estado', 'Unidade', 'Disponibilização'])
  return `<div id="divInfraAreaTabela"><table><tbody>${cabecalho}${linhasDados.join('')}</tbody></table></div>`
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('parseBlocoAssinaturaTable (SEI >= 4.0)', () => {
  it('classifica disponibilizado para a área quando a disponibilização está em branco', () => {
    const linha = montarLinha([
      '', '<a href="/bloco/1">1</a>', 'Assinatura', '01/01/2026', 'Disponibilizado', 'UNIDADE-A', '',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const itens = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })

    expect(itens).toEqual([
      { id: '/bloco/1', numero: '1', link: '/bloco/1', estado: 'disponibilizado_para_area' },
    ])
  })

  it('classifica disponibilizado pela área quando a disponibilização está preenchida', () => {
    const linha = montarLinha([
      '', '<a href="/bloco/2">2</a>', 'Assinatura', '01/01/2026', 'Disponibilizado', 'UNIDADE-A', 'SETIC',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.estado).toBe('disponibilizado_pela_area')
  })

  it.each([
    ['Aberto', 'aberto'],
    ['Gerado', 'aberto'],
    ['Retornado', 'retornado'],
    ['Recebido', 'disponibilizado_para_area'],
  ])('classifica estado "%s" como "%s"', (textoEstado, esperado) => {
    const linha = montarLinha([
      '', '<a href="/bloco/3">3</a>', 'Assinatura', '01/01/2026', textoEstado, 'UNIDADE-A', '',
    ])
    document.body.innerHTML = montarTabelaV4([linha])

    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.estado).toBe(esperado)
  })

  it('ignora a linha de cabeçalho', () => {
    document.body.innerHTML = montarTabelaV4([])
    expect(parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })).toHaveLength(0)
  })

  it('usa um id de fallback quando a linha não tem link', () => {
    const linha = montarLinha(['', '5', 'Assinatura', '01/01/2026', 'Aberto', 'UNIDADE-A', ''])
    document.body.innerHTML = montarTabelaV4([linha])
    const [item] = parseBlocoAssinaturaTable(document.body, { seiVersionAtLeast4: true })
    expect(item.id.startsWith('linha:')).toBe(true)
  })
})

describe('resumirBlocos', () => {
  it('conta os itens por estado', () => {
    const resumo = resumirBlocos([
      { id: '1', numero: '1', link: '', estado: 'disponibilizado_para_area' },
      { id: '2', numero: '2', link: '', estado: 'disponibilizado_para_area' },
      { id: '3', numero: '3', link: '', estado: 'disponibilizado_pela_area' },
      { id: '4', numero: '4', link: '', estado: 'aberto' },
      { id: '5', numero: '5', link: '', estado: 'retornado' },
    ])
    expect(resumo).toEqual({
      totalDisponibilizadoParaArea: 2,
      totalDisponibilizadoPelaArea: 1,
      totalAberto: 1,
      totalRetornado: 1,
    })
  })
})

function montarLinhaBloco(
  numero: string,
  href: string,
  estado: string,
  disponibilizacao: string,
  descricao: string,
  classe = 'infraTrClara'
): string {
  return `<tr class="${classe}">
    <td><input type="checkbox" /></td>
    <td><a href="${href}">${numero}</a></td>
    <td>sinalizacoes</td>
    <td>&nbsp;</td>
    <td>${estado}</td>
    <td>Geradora</td>
    <td>${disponibilizacao}</td>
    <td>&nbsp;</td>
    <td>${descricao}</td>
    <td>acoes</td>
  </tr>`
}

function montarTabelaBlocos(linhas: string[]): string {
  const cabecalho = `<tr><th></th><th>Número</th><th>Sinalizações</th><th>Atribuição</th><th>Estado</th><th>Geradora</th><th>Disponibilização</th><th>Grupo</th><th>Descrição</th><th>Ações</th></tr>`
  return `<table id="tblBlocos">${cabecalho}${linhas.join('')}</table>`
}

describe('parseListaBlocosAssinatura', () => {
  it('lê número, href, descrição e classifica o estado de cada bloco', () => {
    const html = montarTabelaBlocos([
      montarLinhaBloco('154569', 'controlador.php?acao=rel_bloco_protocolo_listar&id_bloco=154569', 'Disponibilizado', '', 'Autorização'),
    ])
    document.body.innerHTML = html

    expect(parseListaBlocosAssinatura(document.body)).toEqual([
      {
        numero: '154569',
        descricao: 'Autorização',
        href: 'controlador.php?acao=rel_bloco_protocolo_listar&id_bloco=154569',
        estado: 'disponibilizado_para_area',
      },
    ])
  })

  it('lê várias linhas (infraTrClara e infraTrEscura)', () => {
    const html = montarTabelaBlocos([
      montarLinhaBloco('1', '/bloco/1', 'Retornado', '', 'Desc 1', 'infraTrClara'),
      montarLinhaBloco('2', '/bloco/2', 'Aberto', '', 'Desc 2', 'infraTrEscura'),
    ])
    document.body.innerHTML = html

    const itens = parseListaBlocosAssinatura(document.body)
    expect(itens.map((item) => item.numero)).toEqual(['1', '2'])
    expect(itens.map((item) => item.estado)).toEqual(['retornado', 'aberto'])
  })

  it('ignora a linha de cabeçalho (sem classe infraTrClara/infraTrEscura/trVermelha)', () => {
    document.body.innerHTML = montarTabelaBlocos([])
    expect(parseListaBlocosAssinatura(document.body)).toEqual([])
  })

  it('retorna lista vazia quando #tblBlocos não existe no documento', () => {
    document.body.innerHTML = '<div></div>'
    expect(parseListaBlocosAssinatura(document.body)).toEqual([])
  })
})

describe('detectarTransicoesParaDisponibilizado', () => {
  const blocoDisponibilizado: BlocoListaItem = {
    numero: '1',
    descricao: 'Desc',
    href: '/bloco/1',
    estado: 'disponibilizado_para_area',
  }

  it('detecta bloco novo já disponibilizado (nunca visto antes)', () => {
    expect(detectarTransicoesParaDisponibilizado([blocoDisponibilizado], {})).toEqual([
      blocoDisponibilizado,
    ])
  })

  it('detecta transição de outro estado pra disponibilizado', () => {
    const conhecidos = { '1': 'retornado' }
    expect(detectarTransicoesParaDisponibilizado([blocoDisponibilizado], conhecidos)).toEqual([
      blocoDisponibilizado,
    ])
  })

  it('não repete notificação se o bloco já era conhecido como disponibilizado', () => {
    const conhecidos = { '1': 'disponibilizado_para_area' }
    expect(detectarTransicoesParaDisponibilizado([blocoDisponibilizado], conhecidos)).toEqual([])
  })

  it('ignora blocos que não estão disponibilizados', () => {
    const blocoRetornado: BlocoListaItem = { numero: '2', descricao: 'D2', href: '/bloco/2', estado: 'retornado' }
    expect(detectarTransicoesParaDisponibilizado([blocoRetornado], {})).toEqual([])
  })

  it('trata conhecidos undefined como vazio (LocalConfig salvo antes do campo existir)', () => {
    // Reproduz o bug real: chrome.storage.local.get() de uma instalação já existente antes de
    // blocoAssinaturaEstadosConhecidos existir retorna o objeto salvo como está, sem mesclar com
    // DEFAULT_LOCAL_CONFIG (createLocalConfigStore só cai no default quando não há NENHUM config
    // salvo, não campo por campo) -- então o campo chega undefined, não {}.
    expect(detectarTransicoesParaDisponibilizado([blocoDisponibilizado], undefined)).toEqual([
      blocoDisponibilizado,
    ])
  })
})
