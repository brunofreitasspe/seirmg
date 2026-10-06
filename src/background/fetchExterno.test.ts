import { describe, expect, it } from 'vitest'
import { hostExternoPermitido } from './fetchExterno'

describe('hostExternoPermitido', () => {
  it('aceita só https nos hosts da lista', () => {
    expect(hostExternoPermitido('https://tinyurl.com/api-create.php?url=x')).toBe(true)
    expect(hostExternoPermitido('http://tinyurl.com/x')).toBe(false)
    expect(hostExternoPermitido('https://tinyurl.com.malicioso.net/x')).toBe(false)
    expect(hostExternoPermitido('https://exemplo.com/')).toBe(false)
    expect(hostExternoPermitido('não é url')).toBe(false)
  })
})
