import bellIconSvg from 'lucide-static/icons/bell.svg?raw'
import { ativarAba } from './tabs'
import { createSyncConfigStore } from '../lib/storage'
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

carregarAbaAssinatura()
carregarSecaoProcessosNovos()
