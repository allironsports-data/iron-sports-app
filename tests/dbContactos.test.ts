import { describe, it, expect } from 'vitest'
import {
  fusionarParaImportar, contactToRow, rowToContact, aplicarOverride, sinNulos,
  type Contact, type ContactoRow,
} from '../src/data/contactos'

const base: Contact[] = [
  { id: 'a1', name: 'Ana', team: 'Abha', region: 'Oriente Medio', role: 'CEO', phone1: '+1', tier: 'Tier 2' },
  { id: 'b2', team: 'Ajman', region: 'Oriente Medio', role: 'President', tier: 'Tier 2', _noContact: true },
  { id: 'c3', name: 'Carlos', region: 'España', phone1: '+34 600' },
]

describe('fusionarParaImportar', () => {
  it('sin nada en localStorage sube los de base tal cual, origen base', () => {
    const filas = fusionarParaImportar(base, {}, [], [])
    expect(filas).toHaveLength(3)
    expect(filas[0]).toEqual({
      id: 'a1', name: 'Ana', team: 'Abha', region: 'Oriente Medio', role: 'CEO',
      phone1: '+1', phone2: null, tier: 'Tier 2', no_contact: false, no_club: false,
      origen: 'base', deleted: false,
    })
    expect(filas[1].no_contact).toBe(true)
    expect(filas[1].name).toBeNull()
  })

  it('aplica overrides: null borra la columna, valor la sustituye', () => {
    const filas = fusionarParaImportar(base, { a1: { region: 'España', phone1: null, role: 'CTO' } }, [], [])
    const a1 = filas.find(f => f.id === 'a1')!
    expect(a1.region).toBe('España')
    expect(a1.phone1).toBeNull()
    expect(a1.role).toBe('CTO')
    expect(a1.name).toBe('Ana')     // no tocado
    expect(a1.origen).toBe('base')
  })

  it('los extra van como manual y se suman', () => {
    const extra: Contact[] = [{ id: 'custom_1', name: 'Nuevo', region: 'Sin club', _noClub: true }]
    const filas = fusionarParaImportar(base, {}, extra, [])
    expect(filas).toHaveLength(4)
    const n = filas.find(f => f.id === 'custom_1')!
    expect(n.origen).toBe('manual')
    expect(n.no_club).toBe(true)
    expect(n.team).toBeNull()
  })

  it('deleted marca deleted=true sin quitar la fila; ids desconocidos se ignoran', () => {
    const filas = fusionarParaImportar(base, {}, [], ['b2', 'no_existe'])
    expect(filas).toHaveLength(3)
    expect(filas.find(f => f.id === 'b2')!.deleted).toBe(true)
    expect(filas.find(f => f.id === 'a1')!.deleted).toBe(false)
  })

  it('un extra con el mismo id que un base gana al base', () => {
    const extra: Contact[] = [{ id: 'a1', name: 'Ana bis', region: 'Italia' }]
    const filas = fusionarParaImportar(base, {}, extra, [])
    expect(filas.filter(f => f.id === 'a1')).toHaveLength(1)
    expect(filas.find(f => f.id === 'a1')!.name).toBe('Ana bis')
    expect(filas.find(f => f.id === 'a1')!.origen).toBe('manual')
  })
})

describe('contactToRow / rowToContact', () => {
  it('ida y vuelta conserva los campos y omite los null', () => {
    const c: Contact = { id: 'x', name: 'X', region: 'España', _noClub: true }
    const row: ContactoRow = { ...contactToRow(c, 'manual'), created_at: 'hoy' }
    expect(row.phone1).toBeNull()
    expect(rowToContact(row)).toEqual(c)
    expect('phone1' in rowToContact(row)).toBe(false)
  })

  it('región vacía cae en «Sin clasificar»', () => {
    expect(contactToRow({ id: 'y', region: '' }, 'base').region).toBe('Sin clasificar')
  })
})

describe('aplicarOverride / sinNulos', () => {
  it('null borra, undefined no toca', () => {
    const c: Contact = { id: 'z', name: 'Z', region: 'R', phone1: '1' }
    const out = aplicarOverride(c, { region: 'R2', phone1: null, name: undefined })
    expect(out).toEqual({ id: 'z', name: 'Z', region: 'R2' })
  })

  it('sinNulos quita null y undefined', () => {
    expect(sinNulos({ region: 'R', name: null, team: undefined, role: 'x' })).toEqual({ region: 'R', role: 'x' })
  })
})
