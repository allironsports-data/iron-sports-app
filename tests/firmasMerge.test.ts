import { describe, it, expect } from 'vitest'
import { reconciliarFirmas } from '../src/lib/firmasMerge'
import type { FirmasEntry, FirmasComment } from '../src/types'

const nota = (id: string, text = id): FirmasComment => ({ id, text, date: '2026-10-01T10:00:00Z' })
const tarjeta = (o: Partial<FirmasEntry> = {}): FirmasEntry => ({
  id: 'f1', playerName: 'Unai', zone: 'Bizkaia', status: 'caliente', managers: ['p1'], comments: [nota('a')],
  sortPos: 0, createdAt: '', updatedAt: 't0', ...o,
})

describe('reconciliarFirmas', () => {
  it('dos personas añaden una nota a la vez: quedan las dos', () => {
    const antes = tarjeta()
    const mia = tarjeta({ comments: [nota('a'), nota('mia')], updatedAt: 't2' })
    const servidor = tarjeta({ comments: [nota('a'), nota('del-otro')], updatedAt: 't1' })
    expect(reconciliarFirmas(antes, mia, servidor).comments.map(c => c.id)).toEqual(['a', 'del-otro', 'mia'])
  })

  it('solo se escribe lo que yo he tocado: el estatus que cambió el otro se respeta', () => {
    const antes = tarjeta()
    const mia = tarjeta({ notes: 'llamar el lunes' })
    const servidor = tarjeta({ status: 'templado', nextAction: 'Reunión' })
    expect(reconciliarFirmas(antes, mia, servidor)).toMatchObject({ status: 'templado', nextAction: 'Reunión', notes: 'llamar el lunes' })
  })

  it('si los dos tocan el mismo campo, gana el que guarda (yo)', () => {
    const r = reconciliarFirmas(tarjeta(), tarjeta({ status: 'frio' }), tarjeta({ status: 'templado' }))
    expect(r.status).toBe('frio')
  })

  it('quitar la próxima acción la quita aunque en el servidor siga', () => {
    const antes = tarjeta({ nextAction: 'Llamar', nextActionDate: '2026-10-02' })
    const mia = tarjeta({ nextAction: undefined, nextActionDate: undefined })
    const r = reconciliarFirmas(antes, mia, antes)
    expect(r.nextAction).toBeUndefined()
    expect(r.nextActionDate).toBeUndefined()
  })

  it('borrar y editar un apunte se aplican sin resucitar ni perder los ajenos', () => {
    const antes = tarjeta({ comments: [nota('a'), nota('b'), nota('c')] })
    const mia = tarjeta({ comments: [nota('a'), nota('c', 'corregido')] })
    const servidor = tarjeta({ comments: [nota('a'), nota('b'), nota('c'), nota('nuevo')] })
    expect(reconciliarFirmas(antes, mia, servidor).comments.map(c => `${c.id}:${c.text}`)).toEqual(['a:a', 'c:corregido', 'nuevo:nuevo'])
  })

  it('sin cambios ajenos, el resultado es mi tarjeta', () => {
    const antes = tarjeta()
    const mia = tarjeta({ comments: [nota('a'), nota('x')], zone: 'Gipuzkoa', updatedAt: 't1' })
    expect(reconciliarFirmas(antes, mia, antes)).toEqual(mia)
  })
})
