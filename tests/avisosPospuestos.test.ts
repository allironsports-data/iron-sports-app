import { describe, it, expect } from 'vitest'
import { claveAviso, estaOculto, type Aviso, type Pospuestos } from '../src/views/captacion/firmas/avisos'

const aviso = (over: Partial<Aviso> = {}): Aviso => ({
  icon: '🔥', tone: 'red', kind: 'sin-accion', entryId: 'e1',
  text: 'Mikel está caliente sin próxima acción programada — ponle fecha',
  ...over,
})

const HOY = '2026-09-09'

describe('avisos pospuestos', () => {
  it('la clave identifica tipo + ficha, no el texto', () => {
    expect(claveAviso(aviso())).toBe('sin-accion|e1')
    expect(claveAviso(aviso({ text: 'otro texto' }))).toBe('sin-accion|e1')
    expect(claveAviso(aviso({ entryId: 'e2' }))).not.toBe(claveAviso(aviso()))
  })

  it('sin registro, el aviso se ve', () => {
    expect(estaOculto(aviso(), {}, HOY)).toBe(false)
  })

  it('pospuesto: oculto hasta que pasa la fecha', () => {
    const p: Pospuestos = { 'sin-accion|e1': { hasta: '2026-09-16' } }
    expect(estaOculto(aviso(), p, HOY)).toBe(true)
    expect(estaOculto(aviso(), p, '2026-09-16')).toBe(false)
    expect(estaOculto(aviso(), p, '2026-09-20')).toBe(false)
  })

  it('pospuesto: sigue oculto aunque cambie el texto', () => {
    const p: Pospuestos = { 'sin-accion|e1': { hasta: '2026-09-16' } }
    expect(estaOculto(aviso({ text: 'texto distinto' }), p, HOY)).toBe(true)
  })

  it('visto: oculto mientras el aviso diga lo mismo', () => {
    const a = aviso()
    const p: Pospuestos = { 'sin-accion|e1': { hasta: '9999-12-31', sig: a.text } }
    expect(estaOculto(a, p, HOY)).toBe(true)
    expect(estaOculto(a, p, '2030-01-01')).toBe(true)
  })

  it('visto: reaparece si el aviso cambia', () => {
    const p: Pospuestos = { 'sin-accion|e1': { hasta: '9999-12-31', sig: 'El contrato acaba el 30/06/2027' } }
    expect(estaOculto(aviso({ kind: 'contrato', text: 'El contrato acaba el 30/06/2028' }), p, HOY)).toBe(false)
  })

  it('el registro no afecta a otras fichas ni a otros tipos', () => {
    const p: Pospuestos = { 'sin-accion|e1': { hasta: '2026-09-16' } }
    expect(estaOculto(aviso({ entryId: 'e2' }), p, HOY)).toBe(false)
    expect(estaOculto(aviso({ kind: 'sin-encargado' }), p, HOY)).toBe(false)
  })
})
