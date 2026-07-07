import bellIconSvg from 'lucide-static/icons/bell.svg?raw'
import { ativarAba } from './tabs'
import {
  createSyncConfigStore,
  type ConfiguracaoCor,
  type ConfiguracaoPontoControle,
  type FormatoDocumento,
  type ModoEspecificacao,
  type NivelAcessoDocumento,
  type ThemePreset,
} from '../lib/storage'
import { montarListaEditavel } from './listaEditavel'
import { colorToFilter } from '../features/ponto-controle/colorToFilter'

interface RegraPontoControleEditavel {
  nome: string
  cor: string
  [chave: string]: string
}
import { ALARM_NAME } from '../background/alarms/blocoAssinaturaCheck'
import { ALARM_NAME_PROCESSOS_NOVOS } from '../background/alarms/processosNovosCheck'

const botoesAba = document.querySelectorAll('.aba-btn')
const paineis = document.querySelectorAll('.painel')

const botaoNotificacoes = document.querySelector('[data-aba="notificacoes"]')
if (botaoNotificacoes) {
  botaoNotificacoes.innerHTML = `${bellIconSvg} Notificações`
}

botoesAba.forEach((botao) => {
  botao.addEventListener('click', () => {
    const aba = botao.getAttribute('data-aba')
    if (aba) ativarAba(botoesAba, paineis, aba)
  })
})

async function carregarAbaAssinatura(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('assinatura-ativo') as HTMLInputElement | null
    const inputIntervalo = document.getElementById('assinatura-intervalo') as HTMLInputElement | null
    const inputSom = document.getElementById('assinatura-som') as HTMLInputElement | null
    const status = document.getElementById('assinatura-status')

    if (inputAtivo) inputAtivo.checked = config.blocoAssinatura.ativo
    if (inputIntervalo) inputIntervalo.value = String(config.blocoAssinatura.intervaloMinutos)
    if (inputSom) inputSom.checked = config.blocoAssinatura.tocarSom

    document.getElementById('assinatura-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          blocoAssinatura: {
            ativo: inputAtivo?.checked ?? true,
            intervaloMinutos: Number(inputIntervalo?.value ?? 15),
            tocarSom: inputSom?.checked ?? true,
          },
        }
        await store.set(atualizado)
        chrome.alarms.create(ALARM_NAME, {
          periodInMinutes: atualizado.blocoAssinatura.intervaloMinutos,
        })
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração do bloco de assinatura:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba de bloco de assinatura:', error)
  }
}

async function carregarSecaoProcessosNovos(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('processos-novos-ativo') as HTMLInputElement | null
    const inputIntervalo = document.getElementById(
      'processos-novos-intervalo'
    ) as HTMLInputElement | null
    const inputSom = document.getElementById('processos-novos-som') as HTMLInputElement | null
    const status = document.getElementById('processos-novos-status')

    if (inputAtivo) inputAtivo.checked = config.processosNovos.ativo
    if (inputIntervalo) inputIntervalo.value = String(config.processosNovos.intervaloMinutos)
    if (inputSom) inputSom.checked = config.processosNovos.tocarSom

    document.getElementById('processos-novos-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          processosNovos: {
            ativo: inputAtivo?.checked ?? true,
            intervaloMinutos: Number(inputIntervalo?.value ?? 5),
            tocarSom: inputSom?.checked ?? true,
          },
        }
        await store.set(atualizado)
        chrome.alarms.create(ALARM_NAME_PROCESSOS_NOVOS, {
          periodInMinutes: atualizado.processosNovos.intervaloMinutos,
        })
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração de processos novos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar seção de processos novos:', error)
  }
}

async function carregarAbaGeral(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputSelecaoMassa = document.getElementById(
      'geral-selecao-massa-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('geral-status')

    if (inputSelecaoMassa) {
      inputSelecaoMassa.checked = config.featureFlags.selecaoEmMassaBlocoAssinatura
    }

    document.getElementById('geral-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          featureFlags: {
            ...config.featureFlags,
            selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração da aba Geral:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Geral:', error)
  }
}

async function carregarAbaAparencia(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const selectPreset = document.getElementById('aparencia-preset') as HTMLSelectElement | null
    const inputCor = document.getElementById('aparencia-cor-customizada') as HTMLInputElement | null
    const status = document.getElementById('aparencia-status')

    if (selectPreset) selectPreset.value = config.tema.preset
    if (inputCor) inputCor.value = config.tema.customColor ?? '#017fff'

    document.getElementById('aparencia-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          tema: {
            preset: (selectPreset?.value ?? 'claro') as ThemePreset,
            customColor: inputCor?.value ?? '#017fff',
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração de aparência:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Aparência:', error)
  }
}

async function carregarAbaProcessos(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputPrazosAtivo = document.getElementById('processos-prazos-ativo') as HTMLInputElement | null
    const inputExibirDias = document.getElementById('processos-prazos-exibir-dias') as HTMLInputElement | null
    const inputAlertaDias = document.getElementById('processos-prazos-alerta-dias') as HTMLInputElement | null
    const inputCriticoDias = document.getElementById('processos-prazos-critico-dias') as HTMLInputElement | null
    const inputExibirPrazo = document.getElementById('processos-prazos-exibir-prazo') as HTMLInputElement | null
    const inputAlertaPrazo = document.getElementById('processos-prazos-alerta-prazo') as HTMLInputElement | null
    const inputCriticoPrazo = document.getElementById('processos-prazos-critico-prazo') as HTMLInputElement | null
    const inputCoresAtivo = document.getElementById('processos-cores-ativo') as HTMLInputElement | null
    const inputEspecificacaoAtivo = document.getElementById(
      'processos-especificacao-ativo'
    ) as HTMLInputElement | null
    const selectModo = document.getElementById('processos-especificacao-modo') as HTMLSelectElement | null
    const inputPontoControleAtivo = document.getElementById(
      'processos-ponto-controle-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('processos-status')

    if (inputPrazosAtivo) inputPrazosAtivo.checked = config.controleProcessos.prazos.ativo
    if (inputExibirDias) inputExibirDias.checked = config.controleProcessos.prazos.exibirDias
    if (inputAlertaDias) inputAlertaDias.value = String(config.controleProcessos.prazos.alertaDias)
    if (inputCriticoDias) inputCriticoDias.value = String(config.controleProcessos.prazos.criticoDias)
    if (inputExibirPrazo) inputExibirPrazo.checked = config.controleProcessos.prazos.exibirPrazo
    if (inputAlertaPrazo) inputAlertaPrazo.value = String(config.controleProcessos.prazos.alertaPrazo)
    if (inputCriticoPrazo) inputCriticoPrazo.value = String(config.controleProcessos.prazos.criticoPrazo)
    if (inputCoresAtivo) inputCoresAtivo.checked = config.controleProcessos.coresProcesso.ativo
    if (inputEspecificacaoAtivo) {
      inputEspecificacaoAtivo.checked = config.controleProcessos.especificacao.ativo
    }
    if (selectModo) selectModo.value = config.controleProcessos.especificacao.modo
    if (inputPontoControleAtivo) inputPontoControleAtivo.checked = config.pontoControle.ativo

    const containerCores = document.getElementById('processos-cores-lista')
    const listaCores = containerCores
      ? montarListaEditavel<ConfiguracaoCor>(
          containerCores,
          [
            { chave: 'valor', rotulo: 'Especificação contém', tipo: 'text' },
            { chave: 'cor', rotulo: 'Cor', tipo: 'color' },
          ],
          config.controleProcessos.coresProcesso.regras
        )
      : null

    const containerPontoControle = document.getElementById('processos-ponto-controle-lista')
    const listaPontoControle = containerPontoControle
      ? montarListaEditavel<RegraPontoControleEditavel>(
          containerPontoControle,
          [
            { chave: 'nome', rotulo: 'Nome do ponto de controle', tipo: 'text' },
            { chave: 'cor', rotulo: 'Cor', tipo: 'color' },
          ],
          config.pontoControle.regras.map(({ nome, cor }) => ({ nome, cor }))
        )
      : null

    document.getElementById('processos-salvar')?.addEventListener('click', async () => {
      try {
        const regrasPontoControle: ConfiguracaoPontoControle[] = (
          listaPontoControle?.obterItens() ?? []
        ).flatMap((regra) => {
          try {
            return [{ nome: regra.nome, cor: regra.cor, filter: colorToFilter(regra.cor) }]
          } catch (error) {
            console.error(`[SEIRMG] Falha ao calcular filtro de cor para "${regra.nome}":`, error)
            return []
          }
        })

        const atualizado = {
          ...config,
          controleProcessos: {
            prazos: {
              ativo: inputPrazosAtivo?.checked ?? true,
              exibirDias: inputExibirDias?.checked ?? true,
              exibirPrazo: inputExibirPrazo?.checked ?? true,
              alertaDias: Number(inputAlertaDias?.value ?? 30),
              criticoDias: Number(inputCriticoDias?.value ?? 60),
              alertaPrazo: Number(inputAlertaPrazo?.value ?? 10),
              criticoPrazo: Number(inputCriticoPrazo?.value ?? 5),
            },
            coresProcesso: {
              ativo: inputCoresAtivo?.checked ?? true,
              regras: listaCores?.obterItens() ?? [],
            },
            especificacao: {
              ativo: inputEspecificacaoAtivo?.checked ?? true,
              modo: (selectModo?.value ?? 'mostrar') as ModoEspecificacao,
            },
            rolagemInfinita: config.controleProcessos.rolagemInfinita,
          },
          pontoControle: {
            ativo: inputPontoControleAtivo?.checked ?? true,
            regras: regrasPontoControle,
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração de Processos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Processos:', error)
  }
}

async function carregarAbaEditor(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputAtivo = document.getElementById('editor-doc-externo-ativo') as HTMLInputElement | null
    const selectFormato = document.getElementById('editor-doc-externo-formato') as HTMLSelectElement | null
    const inputTipoConferencia = document.getElementById(
      'editor-doc-externo-tipo-conferencia'
    ) as HTMLInputElement | null
    const selectNivelAcesso = document.getElementById(
      'editor-doc-externo-nivel-acesso'
    ) as HTMLSelectElement | null
    const inputHipoteseLegal = document.getElementById(
      'editor-doc-externo-hipotese-legal'
    ) as HTMLInputElement | null
    const status = document.getElementById('editor-status')

    if (inputAtivo) inputAtivo.checked = config.documentoExterno.ativo
    if (selectFormato) selectFormato.value = config.documentoExterno.formato
    if (inputTipoConferencia) inputTipoConferencia.value = config.documentoExterno.tipoConferencia
    if (selectNivelAcesso) selectNivelAcesso.value = config.documentoExterno.nivelAcesso
    if (inputHipoteseLegal) inputHipoteseLegal.value = config.documentoExterno.hipoteseLegal

    document.getElementById('editor-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          documentoExterno: {
            ativo: inputAtivo?.checked ?? true,
            formato: (selectFormato?.value ?? 'N') as FormatoDocumento,
            tipoConferencia: inputTipoConferencia?.value ?? '',
            nivelAcesso: (selectNivelAcesso?.value ?? 'P') as NivelAcessoDocumento,
            hipoteseLegal: inputHipoteseLegal?.value ?? '',
          },
        }
        await store.set(atualizado)
        if (status) {
          status.textContent = 'Salvo!'
          setTimeout(() => {
            status.textContent = ''
          }, 2000)
        }
      } catch (error) {
        console.error('[SEIRMG] Falha ao salvar configuração da aba Editor de Documentos:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Editor de Documentos:', error)
  }
}

carregarAbaEditor()
carregarAbaProcessos()
carregarAbaAparencia()
carregarAbaGeral()
carregarAbaAssinatura()
carregarSecaoProcessosNovos()
