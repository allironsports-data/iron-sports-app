import { describe, it, expect } from 'vitest'
import { normConclusion, birthYearFromBirthdate, fmtDate, isAfterToday, personaToName } from '../src/views/captacion/helpers'
import { inicioTemporada, etiquetaTemporada, semaforoEquipo, type FilaEquipo } from '../src/views/captacion/filasEquipos'
import { firmasAging, necesitaTelefono } from '../src/views/captacion/firmas/helpers'
import type { FirmasEntry } from '../src/types'

describe('captacion/helpers', () => {
  it('normConclusion: «Firmar» (legado) cuenta como «Llamar» y vacío es undefined', () => {
    expect(normConclusion('Firmar')).toBe('Llamar')
    expect(normConclusion('Seguir')).toBe('Seguir')
    expect(normConclusion('')).toBeUndefined()
    expect(normConclusion(undefined)).toBeUndefined()
  })

  it('birthYearFromBirthdate saca el año o «—»', () => {
    expect(birthYearFromBirthdate('2006-03-14')).toBe('2006')
    expect(birthYearFromBirthdate(undefined)).toBe('—')
  })

  it('fmtDate no cambia de día por la zona horaria', () => {
    expect(fmtDate('2026-01-01')).toContain('2026')
    expect(fmtDate('2026-01-01')).toMatch(/^01/)
    expect(fmtDate(undefined)).toBe('—')
  })

  it('isAfterToday: mañana sí, hoy no', () => {
    const d = new Date()
    const iso = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
    expect(isAfterToday(iso(d))).toBe(false)
    d.setDate(d.getDate() + 1)
    expect(isAfterToday(iso(d))).toBe(true)
  })

  it('personaToName resuelve el avatar contra los perfiles', () => {
    const profiles = [{ id: '1', avatar: 'JG', name: 'Juan García', is_admin: false }] as never[]
    expect(personaToName('JG', profiles)).toBe('Juan García')
    expect(personaToName('ZZ', profiles)).toBe('ZZ')   // sin perfil: se queda el avatar
    expect(personaToName(undefined, profiles)).toBe('')
  })
})

describe('captacion/filasEquipos', () => {
  it('la temporada empieza el 1 de julio', () => {
    expect(inicioTemporada(new Date(2026, 8, 3))).toBe('2026-07-01')   // septiembre → temporada 26-27
    expect(inicioTemporada(new Date(2026, 5, 30))).toBe('2025-07-01')  // junio → todavía 25-26
    expect(etiquetaTemporada('2026-07-01')).toBe('26-27')
  })

  it('semáforo: solo los relevantes se evalúan', () => {
    const base: FilaEquipo = {
      nombre: 'X', clave: 'x', club: 'X', categoria: 'Juvenil', zona: 'Z', relevante: true, cubierto: false,
      enCatalogo: true, jugadores: 0, plantilla: [], informes: 0, partidos: 0, partidosHist: 0,
    }
    expect(semaforoEquipo({ ...base, relevante: false }, 0).txt).toBe('—')
    expect(semaforoEquipo(base, 0).txt).toBe('sin nadie')
    expect(semaforoEquipo({ ...base, jugadores: 3 }, 0).txt).toBe('sin partidos')
    expect(semaforoEquipo({ ...base, jugadores: 3 }, 2).txt).toBe('sin informes')
    expect(semaforoEquipo({ ...base, jugadores: 3, informes: 1 }, 2).txt).toBe('controlado')
  })
})

describe('captacion/firmas/helpers', () => {
  const entry = (over: Partial<FirmasEntry>): FirmasEntry => ({
    id: 'e1', playerName: 'Test', status: 'caliente', zone: 'Z', managers: [], comments: [], sortPos: 0,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', ...over,
  })

  it('firmasAging: solo los estados con límite envejecen', () => {
    expect(firmasAging(entry({ status: 'llamar' }))).toBeNull()
    const a = firmasAging(entry({ status: 'caliente' }))
    expect(a).not.toBeNull()
    expect(a!.limit).toBe(10)
    expect(a!.overdue).toBe(true)
  })

  it('necesitaTelefono: por tipo de acción o por el texto, nunca si ya firmó', () => {
    expect(necesitaTelefono(entry({ nextActionKind: 'telefono' }))).toBe(true)
    expect(necesitaTelefono(entry({ nextAction: 'Pedir el móvil al padre' }))).toBe(true)
    expect(necesitaTelefono(entry({ nextAction: 'Reunión' }))).toBe(false)
    expect(necesitaTelefono(entry({ status: 'firmado', nextActionKind: 'telefono' }))).toBe(false)
  })
})
