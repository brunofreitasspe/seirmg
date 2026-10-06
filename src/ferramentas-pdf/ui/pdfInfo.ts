import { PDFDocument } from 'pdf-lib'

// Separado do kit pra não arrastar o pdf-lib pro bundle do catálogo.
export async function contarPaginas(bytes: Uint8Array): Promise<number> {
  return (await PDFDocument.load(bytes, { ignoreEncryption: true })).getPageCount()
}
