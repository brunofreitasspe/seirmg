export function extrairUrlIncluirDocumento(scriptsHtml: string): string | null {
  const regex = /^Nos\[0\]\.acoes = '<a href="(.*?)" tabindex="451"/m
  const resultado = regex.exec(scriptsHtml)
  return resultado ? resultado[1] : null
}

export function extrairUrlDocumentoExterno(respostaHtml: string): string | null {
  const regex = /<a\s+(?:[^>]*?\s+)?href="(.*?)" tabindex="1003" class="ancoraOpcao"> Externo<\/a>/m
  const resultado = regex.exec(respostaHtml)
  return resultado ? resultado[1] : null
}

export function extrairUrlUpload(respostaHtml: string): string | null {
  const regex = /^\s*objUpload = new infraUpload\('frmAnexos','(.+?)'\);/m
  const resultado = regex.exec(respostaHtml)
  return resultado ? resultado[1] : null
}

export interface UsuarioEUnidade {
  usuario: string
  unidade: string
}

export function extrairUsuarioEUnidade(respostaHtml: string): UsuarioEUnidade | null {
  const regex =
    /objTabelaAnexos\.adicionar\(\[arr\['nome_upload'\],arr\['nome'\],arr\['data_hora'\],arr\['tamanho'\],infraFormatarTamanhoBytes\(arr\['tamanho'\]\),'(.+?)' ,'(.+?)'\]\);/m
  const resultado = regex.exec(respostaHtml)
  if (!resultado) return null
  return { usuario: resultado[1], unidade: resultado[2] }
}

export function formatarTamanhoBytes(numBytes: number): string {
  if (numBytes > 1099511627776) return `${Math.round((numBytes / 1099511627776) * 100) / 100} Tb`
  if (numBytes > 1073741824) return `${Math.round((numBytes / 1073741824) * 100) / 100} Gb`
  if (numBytes > 1048576) return `${Math.round((numBytes / 1048576) * 100) / 100} Mb`
  return `${Math.round((numBytes / 1024) * 100) / 100} Kb`
}

export function montarHdnAnexos(usuarioEUnidade: UsuarioEUnidade, uploadIdentificador: string): string {
  const partes = uploadIdentificador.split('#')
  const id = partes[0] ?? ''
  const nome = partes[1] ?? ''
  const dthora = partes[4] ?? ''
  const tamanho = partes[3] ?? '0'
  const tamanhoFormatado = formatarTamanhoBytes(Number.parseInt(tamanho, 10))
  return `${id}±${nome}±${dthora}±${tamanho}±${tamanhoFormatado}±${usuarioEUnidade.usuario}±${usuarioEUnidade.unidade}`
}

export function respostaIndicaSucesso(respostaHtml: string): boolean {
  return /<div id="divArvoreHtml"><\/div>/m.test(respostaHtml)
}

export function obterNomeDocumento(nomeArquivo: string): string {
  return nomeArquivo.replace(/\.[^/.]+$/, '').slice(0, 49)
}
