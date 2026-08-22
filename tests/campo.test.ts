import { describe, it, expect } from 'vitest'
import { slotDe, grupoDe, grupoLargoDe, lineaDeSlot, slotDeJugador } from '../src/lib/campo'

describe('posiciones de captación', () => {
  it('el caso que estaba mal: «Segunda punta» es delantero en todas partes', () => {
    // Antes: DEL en Captación, DEL en el PDF y «Otros» en las estadísticas.
    expect(slotDe('Segunda punta')).toBe('DEL')
    expect(grupoDe('Segunda punta')).toBe('DEL')
    expect(grupoLargoDe('Segunda punta')).toBe('Delantero')
  })

  it('mediapunta no cae en «medio» genérico', () => {
    expect(slotDe('Mediapunta')).toBe('MP')
    expect(slotDe('Media punta')).toBe('MP')
    expect(slotDe('Enganche')).toBe('MP')
    expect(grupoDe('Mediapunta')).toBe('MED')
  })

  it('distingue el lado', () => {
    expect(slotDe('Lateral derecho')).toBe('LD')
    expect(slotDe('Lateral izquierdo')).toBe('LI')
    expect(slotDe('Central derecho')).toBe('CTD')
    expect(slotDe('Central izquierdo')).toBe('CTI')
    expect(slotDe('Extremo izquierdo')).toBe('EI')
    expect(slotDe('Extremo derecho')).toBe('ED')
  })

  it('el lateral sin lado cae a la derecha, el central sin lado al medio', () => {
    expect(slotDe('Lateral')).toBe('LD')
    expect(slotDe('Carrilero')).toBe('LD')
    expect(slotDe('Central')).toBe('CT')
    expect(slotDe('Defensa')).toBe('CT')
  })

  it('acentos y mayúsculas dan igual', () => {
    expect(slotDe('PIVOTE')).toBe('PIV')
    expect(slotDe('portero')).toBe('POR')
    expect(slotDe('GK')).toBe('POR')
  })

  it('distingue «no lo sabemos» de «no lo entendemos»', () => {
    expect(grupoLargoDe('')).toBe('Sin posición')
    expect(grupoLargoDe(undefined)).toBe('Sin posición')
    expect(grupoLargoDe('Utility')).toBe('Otros')
  })

  it('si no hay posición principal, usa la secundaria', () => {
    expect(slotDeJugador(undefined, 'Pivote')).toBe('PIV')
    expect(slotDeJugador('', 'Portero')).toBe('POR')
    expect(slotDeJugador('Delantero', 'Portero')).toBe('DEL')
  })

  it('las líneas del PDF salen del mismo sitio', () => {
    expect(lineaDeSlot(slotDe('Lateral derecho'))).toBe('Defensas')
    expect(lineaDeSlot(slotDe('Extremo izquierdo'))).toBe('Bandas')
    expect(lineaDeSlot(slotDe('Pivote'))).toBe('Centro del campo')
    expect(lineaDeSlot(null)).toBe('Otros')
  })
})
