import { describe, it, expect } from 'vitest'
import { filaCsv } from '../src/lib/csv'

describe('csv', () => {
  it('entrecomilla lo que lleva el separador, comillas o saltos', () => {
    expect(filaCsv(['Peña; hijo'])).toBe('"Peña; hijo"')
    expect(filaCsv(['dijo "hola"'])).toBe('"dijo ""hola"""')
    expect(filaCsv(['dos\nlíneas'])).toBe('"dos\nlíneas"')
  })

  it('lo normal va tal cual, separado por ;', () => {
    expect(filaCsv(['Juan', 'Valencia', 2008])).toBe('Juan;Valencia;2008')
  })

  it('los huecos quedan vacíos, no dicen «null»', () => {
    expect(filaCsv([null, undefined, ''])).toBe(';;')
  })

  it('neutraliza fórmulas: = + - @ al inicio llevan comilla simple delante', () => {
    expect(filaCsv(['=HYPERLINK("x")'])).toBe(`"'=HYPERLINK(""x"")"`)
    expect(filaCsv(['+1', '-cmd', '@SUM'])).toBe(`'+1;'-cmd;'@SUM`)
  })

  it('los números negativos de verdad no se tocan', () => {
    expect(filaCsv([-3, -0.5, 'texto normal'])).toBe('-3;-0.5;texto normal')
  })
})
