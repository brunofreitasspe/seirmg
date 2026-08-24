import { describe, expect, it } from 'vitest'
import { calcularSnapshotsControleProcessos, extrairLinhasDeControle } from './snapshotsControleProcessos'
import type { LocalConfig, SyncConfig } from '../../lib/storage'
import { DEFAULT_SYNC_CONFIG } from '../../lib/storage'

const AGORA = '2026-08-24T10:00:00.000Z'

function criarLinha(html: string): Element {
  const doc = new DOMParser().parseFromString(`<table><tbody><tr>${html}</tr></tbody></table>`, 'text/html')
  return doc.querySelector('tr') as Element
}

function linhaComPrazoEAlterado(numero: string, prazoTexto: string, alterado: boolean): Element {
  const imgAlterado = alterado ? '<img src="svg/exclamacao.svg?18">' : ''
  return criarLinha(
    `<td><a class="processoVisualizado" href="controlador.php?acao=x&id=${numero}"> ${numero} </a>${imgAlterado}</td>` +
      `<td><a href="controlador.php?acao=controle_prazo_definir&id=1" onmouseover="return infraTooltipMostrar('${prazoTexto} (10 dias)','Detalhe')"><img src="prazo.gif"></a></td>`
  )
}

function configCom(prazosAtivo: boolean): SyncConfig {
  return {
    ...DEFAULT_SYNC_CONFIG,
    controleProcessos: {
      ...DEFAULT_SYNC_CONFIG.controleProcessos,
      prazos: { ...DEFAULT_SYNC_CONFIG.controleProcessos.prazos, ativo: prazosAtivo },
    },
  }
}

const LOCAL_CONFIG_VAZIO: Pick<LocalConfig, 'snapshotPrazosProcessos' | 'snapshotAlteradosProcessos'> = {
  snapshotPrazosProcessos: [],
  snapshotAlteradosProcessos: [],
}

describe('extrairLinhasDeControle', () => {
  it('extrai linhas de tbody das 3 tabelas conhecidas, ignorando linhas de cabeçalho de grupo', () => {
    const doc = new DOMParser().parseFromString(
      `<div>
        <table id="tblProcessosRecebidos"><tbody>
          <tr class="seirmg-cabecalho-grupo"><td>Grupo</td></tr>
          <tr><td>linha 1</td></tr>
        </tbody></table>
        <table id="tblProcessosGerados"><tbody><tr><td>linha 2</td></tr></tbody></table>
      </div>`,
      'text/html'
    )
    const linhas = extrairLinhasDeControle(doc)
    expect(linhas).toHaveLength(2)
    const textos = linhas.map((linha) => linha.textContent)
    expect(textos.some((texto) => texto?.includes('linha 1'))).toBe(true)
    expect(textos.some((texto) => texto?.includes('linha 2'))).toBe(true)
  })

  it('retorna lista vazia quando nenhuma das tabelas conhecidas existe', () => {
    const doc = new DOMParser().parseFromString('<div>sem tabelas</div>', 'text/html')
    expect(extrairLinhasDeControle(doc)).toEqual([])
  })
})

describe('calcularSnapshotsControleProcessos', () => {
  it('calcula prazos e alterados quando prazos.ativo e há mudança nos dois', () => {
    const linhas = [linhaComPrazoEAlterado('HMMG.1', '15/08/2026', true)]
    const resultado = calcularSnapshotsControleProcessos(linhas, configCom(true), LOCAL_CONFIG_VAZIO, AGORA)

    expect(resultado.mudou).toBe(true)
    expect(resultado.atualizacao.snapshotPrazosProcessos).toEqual([
      { numero: 'HMMG.1', especificacao: undefined, link: 'controlador.php?acao=x&id=HMMG.1', prazoDataTexto: '15/08/2026', vistoEm: AGORA },
    ])
    expect(resultado.atualizacao.snapshotAlteradosProcessos).toEqual([
      { numero: 'HMMG.1', especificacao: undefined, link: 'controlador.php?acao=x&id=HMMG.1', vistoEm: AGORA },
    ])
  })

  it('não calcula prazos quando controleProcessos.prazos.ativo é false, mas ainda calcula alterados', () => {
    const linhas = [linhaComPrazoEAlterado('HMMG.1', '15/08/2026', true)]
    const resultado = calcularSnapshotsControleProcessos(linhas, configCom(false), LOCAL_CONFIG_VAZIO, AGORA)

    expect(resultado.mudou).toBe(true)
    expect(resultado.atualizacao.snapshotPrazosProcessos).toBeUndefined()
    expect(resultado.atualizacao.snapshotAlteradosProcessos).toHaveLength(1)
  })

  it('não marca mudou e não inclui campo nenhum na atualização quando nada mudou', () => {
    const linhas = [linhaComPrazoEAlterado('HMMG.1', '15/08/2026', false)]
    const localConfigComPrazoIgual: Pick<LocalConfig, 'snapshotPrazosProcessos' | 'snapshotAlteradosProcessos'> = {
      snapshotPrazosProcessos: [
        { numero: 'HMMG.1', especificacao: undefined, link: 'controlador.php?acao=x&id=HMMG.1', prazoDataTexto: '15/08/2026', vistoEm: '2026-08-01T00:00:00.000Z' },
      ],
      snapshotAlteradosProcessos: [],
    }
    const resultado = calcularSnapshotsControleProcessos(linhas, configCom(true), localConfigComPrazoIgual, AGORA)

    expect(resultado.mudou).toBe(false)
    expect(resultado.atualizacao).toEqual({})
  })

  it('ignora linhas sem um processo extraível (extrairFavoritoDaLinha retorna null)', () => {
    const linhaSemProcesso = criarLinha('<td>coluna sem link de processo</td>')
    const resultado = calcularSnapshotsControleProcessos([linhaSemProcesso], configCom(true), LOCAL_CONFIG_VAZIO, AGORA)

    expect(resultado.mudou).toBe(false)
    expect(resultado.atualizacao).toEqual({})
  })

  it('lida com lista de linhas vazia sem quebrar', () => {
    const resultado = calcularSnapshotsControleProcessos([], configCom(true), LOCAL_CONFIG_VAZIO, AGORA)
    expect(resultado).toEqual({ atualizacao: {}, mudou: false })
  })
})
