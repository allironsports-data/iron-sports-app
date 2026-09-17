import { describe, it, expect } from 'vitest'
import {
  opcionesPartner, jugadorEsDePartner, PARTNER_TODOS, PARTNER_NINGUNO,
} from '../src/lib/partners'

const j = (partner?: string) => ({ partner })

describe('opcionesPartner', () => {
  it('sin jugadores no hay opciones', () => {
    expect(opcionesPartner([])).toEqual([])
  })

  it('agrupa por partner y cuenta', () => {
    const o = opcionesPartner([j('Toldra'), j('Toldra'), j('Boulema')])
    expect(o.map(x => [x.label, x.count])).toEqual([['Toldra', 2], ['Boulema', 1]])
  })

  it('«Toldrá», «toldra » y «Toldra» son el mismo partner', () => {
    const o = opcionesPartner([j('Toldrá'), j('toldra '), j('Toldra'), j('Toldra')])
    expect(o).toHaveLength(1)
    expect(o[0].count).toBe(4)
    expect(o[0].key).toBe('toldra')
  })

  it('enseña la grafía más repetida del grupo', () => {
    const o = opcionesPartner([j('toldra'), j('Toldrá'), j('Toldrá')])
    expect(o[0].label).toBe('Toldrá')
  })

  it('a igualdad de grafías elige siempre la misma (determinista)', () => {
    const a = opcionesPartner([j('Toldra'), j('Toldrá')])[0].label
    const b = opcionesPartner([j('Toldrá'), j('Toldra')])[0].label
    expect(a).toBe(b)
  })

  it('«Sin partner» va al final aunque sea el grupo más grande', () => {
    const o = opcionesPartner([j(), j(), j(), j('Boulema')])
    expect(o.map(x => x.key)).toEqual(['boulema', PARTNER_NINGUNO])
    expect(o[1].count).toBe(3)
  })

  it('no aparece «Sin partner» si todos tienen', () => {
    const o = opcionesPartner([j('Toldra'), j('Boulema')])
    expect(o.some(x => x.key === PARTNER_NINGUNO)).toBe(false)
  })

  it('el vacío y los espacios cuentan como sin partner', () => {
    const o = opcionesPartner([j(''), j('   '), j(undefined)])
    expect(o).toEqual([{ key: PARTNER_NINGUNO, label: 'Sin partner', count: 3 }])
  })

  it('a igualdad de jugadores ordena alfabéticamente', () => {
    const o = opcionesPartner([j('Toldra'), j('Boulema')])
    expect(o.map(x => x.label)).toEqual(['Boulema', 'Toldra'])
  })
})

describe('jugadorEsDePartner', () => {
  it('«Todos» acepta a cualquiera', () => {
    expect(jugadorEsDePartner('Toldra', PARTNER_TODOS)).toBe(true)
    expect(jugadorEsDePartner(undefined, PARTNER_TODOS)).toBe(true)
  })

  it('compara sin acentos ni mayúsculas', () => {
    expect(jugadorEsDePartner('Toldrá', 'toldra')).toBe(true)
    expect(jugadorEsDePartner('  TOLDRA ', 'toldra')).toBe(true)
    expect(jugadorEsDePartner('Boulema', 'toldra')).toBe(false)
  })

  it('«Sin partner» solo coge a los que no tienen', () => {
    expect(jugadorEsDePartner(undefined, PARTNER_NINGUNO)).toBe(true)
    expect(jugadorEsDePartner('   ', PARTNER_NINGUNO)).toBe(true)
    expect(jugadorEsDePartner('Toldra', PARTNER_NINGUNO)).toBe(false)
  })
})
