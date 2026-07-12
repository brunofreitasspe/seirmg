import settingsIconSvg from 'lucide-static/icons/settings.svg?raw'
import paletteIconSvg from 'lucide-static/icons/palette.svg?raw'
import listChecksIconSvg from 'lucide-static/icons/list-checks.svg?raw'
import fileEditIconSvg from 'lucide-static/icons/file-edit.svg?raw'
import sparklesIconSvg from 'lucide-static/icons/sparkles.svg?raw'
import bellIconSvg from 'lucide-static/icons/bell.svg?raw'
import plugIconSvg from 'lucide-static/icons/plug.svg?raw'
import infoIconSvg from 'lucide-static/icons/info.svg?raw'
import { ativarAba } from './tabs'
import {
  createLocalConfigStore,
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
import { decodificarPayloadJwtSemVerificar, tokenValido } from '../features/planka/token'

interface RegraPontoControleEditavel {
  nome: string
  cor: string
  [chave: string]: string
}
const botoesAba = document.querySelectorAll('.aba-btn')
const paineis = document.querySelectorAll('.painel')

const ICONES_ABA: Record<string, string> = {
  geral: settingsIconSvg,
  aparencia: paletteIconSvg,
  processos: listChecksIconSvg,
  editor: fileEditIconSvg,
  ia: sparklesIconSvg,
  notificacoes: bellIconSvg,
  integracoes: plugIconSvg,
  sobre: infoIconSvg,
}

botoesAba.forEach((botao) => {
  const aba = botao.getAttribute('data-aba')
  const icone = aba ? ICONES_ABA[aba] : undefined
  if (!icone) return
  const rotulo = botao.textContent?.trim() ?? ''
  botao.innerHTML = `${icone}<span>${rotulo}</span>`
})

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
    const inputSom = document.getElementById('assinatura-som') as HTMLInputElement | null
    const inputLembreteIntervalo = document.getElementById(
      'assinatura-lembrete-intervalo'
    ) as HTMLInputElement | null
    const status = document.getElementById('assinatura-status')

    if (inputAtivo) inputAtivo.checked = config.blocoAssinatura.ativo
    if (inputSom) inputSom.checked = config.blocoAssinatura.tocarSom
    if (inputLembreteIntervalo) {
      inputLembreteIntervalo.value = String(config.blocoAssinatura.lembreteIntervaloMinutos)
    }

    document.getElementById('assinatura-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          blocoAssinatura: {
            ativo: inputAtivo?.checked ?? true,
            tocarSom: inputSom?.checked ?? true,
            lembreteIntervaloMinutos: Math.max(0, Math.round(Number(inputLembreteIntervalo?.value) || 0)),
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
        console.error('[SEIRMG] Falha ao salvar configuração do bloco de assinatura:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba de bloco de assinatura:', error)
  }
}

async function carregarAbaGeral(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputSelecaoMassa = document.getElementById(
      'geral-selecao-massa-ativo'
    ) as HTMLInputElement | null
    const inputDesabilitarAssinados = document.getElementById(
      'geral-desabilitar-assinados-ativo'
    ) as HTMLInputElement | null
    const status = document.getElementById('geral-status')

    if (inputSelecaoMassa) {
      inputSelecaoMassa.checked = config.featureFlags.selecaoEmMassaBlocoAssinatura
    }
    if (inputDesabilitarAssinados) {
      inputDesabilitarAssinados.checked = config.featureFlags.desabilitarDocumentosAssinados
    }

    document.getElementById('geral-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          featureFlags: {
            ...config.featureFlags,
            selecaoEmMassaBlocoAssinatura: inputSelecaoMassa?.checked ?? true,
            desabilitarDocumentosAssinados: inputDesabilitarAssinados?.checked ?? true,
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
    const inputRolagemInfinitaAtivo = document.getElementById(
      'processos-rolagem-infinita-ativo'
    ) as HTMLInputElement | null
    const inputFavoritosAtivo = document.getElementById('processos-favoritos-ativo') as HTMLInputElement | null
    const inputAlertaNaoAssinadosAtivo = document.getElementById(
      'processos-alerta-nao-assinados-ativo'
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
    if (inputRolagemInfinitaAtivo) {
      inputRolagemInfinitaAtivo.checked = config.controleProcessos.rolagemInfinita.ativo
    }
    if (inputFavoritosAtivo) {
      inputFavoritosAtivo.checked = config.controleProcessos.favoritos.ativo
    }
    if (inputAlertaNaoAssinadosAtivo) {
      inputAlertaNaoAssinadosAtivo.checked = config.controleProcessos.alertaNaoAssinados.ativo
    }

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
            rolagemInfinita: {
              ativo: inputRolagemInfinitaAtivo?.checked ?? false,
            },
            agrupamento: config.controleProcessos.agrupamento,
            favoritos: {
              ativo: inputFavoritosAtivo?.checked ?? false,
              itens: config.controleProcessos.favoritos.itens,
            },
            alertaNaoAssinados: {
              ativo: inputAlertaNaoAssinadosAtivo?.checked ?? true,
            },
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
    const inputTipoPadraoArrastar = document.getElementById(
      'editor-doc-externo-tipo-padrao-arrastar'
    ) as HTMLInputElement | null
    const status = document.getElementById('editor-status')

    if (inputAtivo) inputAtivo.checked = config.documentoExterno.ativo
    if (selectFormato) selectFormato.value = config.documentoExterno.formato
    if (inputTipoConferencia) inputTipoConferencia.value = config.documentoExterno.tipoConferencia
    if (selectNivelAcesso) selectNivelAcesso.value = config.documentoExterno.nivelAcesso
    if (inputHipoteseLegal) inputHipoteseLegal.value = config.documentoExterno.hipoteseLegal
    if (inputTipoPadraoArrastar) {
      inputTipoPadraoArrastar.value = config.documentoExterno.tipoDocumentoPadraoArrastar
    }

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
            tipoDocumentoPadraoArrastar: inputTipoPadraoArrastar?.value.trim() || 'Anexo',
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

async function carregarAbaIA(): Promise<void> {
  try {
    const store = createSyncConfigStore()
    const config = await store.get()

    const inputIaAtivo = document.getElementById('ia-ativo') as HTMLInputElement | null
    const inputIaOpenaiKey = document.getElementById('ia-openai-key') as HTMLInputElement | null
    const inputIaOpenaiModelo = document.getElementById('ia-openai-modelo') as HTMLInputElement | null
    const inputIaGeminiKey = document.getElementById('ia-gemini-key') as HTMLInputElement | null
    const inputIaGeminiModelo = document.getElementById('ia-gemini-modelo') as HTMLInputElement | null
    const inputIaClaudeKey = document.getElementById('ia-claude-key') as HTMLInputElement | null
    const inputIaClaudeModelo = document.getElementById('ia-claude-modelo') as HTMLInputElement | null
    const status = document.getElementById('ia-status')

    if (inputIaAtivo) inputIaAtivo.checked = config.ferramentasIA.ativo
    if (inputIaOpenaiKey) inputIaOpenaiKey.value = config.ferramentasIA.openai.apiKey
    if (inputIaOpenaiModelo) inputIaOpenaiModelo.value = config.ferramentasIA.openai.modelo
    if (inputIaGeminiKey) inputIaGeminiKey.value = config.ferramentasIA.gemini.apiKey
    if (inputIaGeminiModelo) inputIaGeminiModelo.value = config.ferramentasIA.gemini.modelo
    if (inputIaClaudeKey) inputIaClaudeKey.value = config.ferramentasIA.claude.apiKey
    if (inputIaClaudeModelo) inputIaClaudeModelo.value = config.ferramentasIA.claude.modelo

    document.getElementById('ia-salvar')?.addEventListener('click', async () => {
      try {
        const atualizado = {
          ...config,
          ferramentasIA: {
            ativo: inputIaAtivo?.checked ?? false,
            provedorAtivo: config.ferramentasIA.provedorAtivo,
            openai: {
              apiKey: inputIaOpenaiKey?.value ?? '',
              modelo: inputIaOpenaiModelo?.value.trim() || 'gpt-4o-mini',
            },
            gemini: {
              apiKey: inputIaGeminiKey?.value ?? '',
              modelo: inputIaGeminiModelo?.value.trim() || 'gemini-2.0-flash',
            },
            claude: {
              apiKey: inputIaClaudeKey?.value ?? '',
              modelo: inputIaClaudeModelo?.value.trim() || 'claude-3-5-haiku-20241022',
            },
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
        console.error('[SEIRMG] Falha ao salvar configuração da aba Ferramentas de IA:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Ferramentas de IA:', error)
  }
}

async function carregarAbaIntegracoes(): Promise<void> {
  try {
    const store = createLocalConfigStore()

    const inputUrlCadastro = document.getElementById(
      'integracoes-planka-url-cadastro'
    ) as HTMLInputElement | null
    const inputUrlLogin = document.getElementById('integracoes-planka-url-login') as HTMLInputElement | null
    const inputUrlConsulta = document.getElementById(
      'integracoes-planka-url-consulta'
    ) as HTMLInputElement | null
    const inputUrlVerificarLote = document.getElementById(
      'integracoes-planka-url-verificar-lote'
    ) as HTMLInputElement | null
    const inputEmail = document.getElementById('integracoes-planka-email') as HTMLInputElement | null
    const inputSenha = document.getElementById('integracoes-planka-senha') as HTMLInputElement | null
    const divConectado = document.getElementById('integracoes-planka-conectado')
    const spanEmailConectado = document.getElementById('integracoes-planka-email-conectado')
    const linkCadastro = document.getElementById(
      'integracoes-planka-link-cadastro'
    ) as HTMLAnchorElement | null
    const status = document.getElementById('integracoes-status')

    async function renderizarEstado(): Promise<void> {
      const config = await store.get()
      const planka = config.planka

      if (inputUrlCadastro) inputUrlCadastro.value = planka?.urlCadastro ?? ''
      if (inputUrlLogin) inputUrlLogin.value = planka?.urlLogin ?? ''
      if (inputUrlConsulta) inputUrlConsulta.value = planka?.urlConsulta ?? ''
      if (inputUrlVerificarLote) inputUrlVerificarLote.value = planka?.urlVerificarLote ?? ''
      if (inputEmail) inputEmail.value = planka?.email ?? ''

      if (linkCadastro) {
        if (planka?.urlCadastro) {
          linkCadastro.href = planka.urlCadastro
          linkCadastro.style.display = ''
        } else {
          linkCadastro.style.display = 'none'
        }
      }

      const conectado = tokenValido(planka?.tokenExp, new Date().toISOString())
      if (divConectado) divConectado.style.display = conectado ? 'block' : 'none'
      if (spanEmailConectado) spanEmailConectado.textContent = planka?.email ?? ''
    }

    await renderizarEstado()

    document.getElementById('integracoes-planka-entrar')?.addEventListener('click', async () => {
      try {
        const urlCadastro = inputUrlCadastro?.value.trim() ?? ''
        const urlLogin = (inputUrlLogin?.value.trim() ?? '').replace(/\/+$/, '')
        const urlConsulta = (inputUrlConsulta?.value.trim() ?? '').replace(/\/+$/, '')
        const urlVerificarLote = (inputUrlVerificarLote?.value.trim() ?? '').replace(/\/+$/, '')
        const email = inputEmail?.value.trim() ?? ''
        const senha = inputSenha?.value ?? ''

        if (!urlLogin || !urlConsulta || !email || !senha) {
          if (status) status.textContent = 'Preencha URL de login, URL de consulta, e-mail e senha.'
          return
        }

        const origens = Array.from(
          new Set(
            [urlLogin, urlConsulta, urlVerificarLote]
              .filter((url) => url.length > 0)
              .map((url) => `${new URL(url).origin}/*`)
          )
        )
        const concedida = await chrome.permissions.request({ origins: origens })
        if (!concedida) {
          if (status) status.textContent = 'Permissão negada — não é possível conectar sem acesso ao domínio.'
          return
        }

        const resposta = await fetch(urlLogin, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, senha }),
        })

        if (resposta.status === 401) {
          if (status) status.textContent = 'Credenciais inválidas.'
          return
        }
        if (!resposta.ok) {
          if (status) status.textContent = 'Erro ao conectar ao n8n.'
          return
        }

        const corpo = (await resposta.json()) as { token?: string }
        const payload = corpo.token ? decodificarPayloadJwtSemVerificar(corpo.token) : null
        const tokenExp = typeof payload?.exp === 'number' ? payload.exp : undefined

        if (!corpo.token || tokenExp === undefined) {
          if (status) status.textContent = 'Resposta inesperada do servidor de login.'
          return
        }

        const config = await store.get()
        await store.set({
          ...config,
          planka: { urlCadastro, urlLogin, urlConsulta, urlVerificarLote, email, token: corpo.token, tokenExp },
        })

        if (status) status.textContent = ''
        if (inputSenha) inputSenha.value = ''
        await renderizarEstado()
      } catch (error) {
        console.error('[SEIRMG] Falha ao conectar com o Planka:', error)
        if (status) status.textContent = 'Erro ao conectar ao n8n.'
      }
    })

    document.getElementById('integracoes-planka-sair')?.addEventListener('click', async () => {
      try {
        const config = await store.get()
        await store.set({ ...config, planka: undefined })
        if (status) status.textContent = ''
        await renderizarEstado()
      } catch (error) {
        console.error('[SEIRMG] Falha ao desconectar do Planka:', error)
      }
    })
  } catch (error) {
    console.error('[SEIRMG] Falha ao carregar aba Integrações:', error)
  }
}

carregarAbaEditor()
carregarAbaIA()
carregarAbaProcessos()
carregarAbaAparencia()
carregarAbaGeral()
carregarAbaAssinatura()
carregarAbaIntegracoes()
