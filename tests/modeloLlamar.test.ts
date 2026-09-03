import { describe, it, expect } from 'vitest'
import { buildModel, claveModelo, puntuarTexto, tokenize, normConclusion } from '../src/lib/modeloLlamar'
import type { ScoutingReport } from '../src/types'

// Datos sintéticos: los «Llamar» hablan de «desborde» y «gol», los demás de
// «lento» y «flojo». Un modelo mínimamente sano tiene que separarlos.
function generar(n: number): ScoutingReport[] {
  const relleno = ['jornada', 'observado', 'contexto', 'rival', 'posicion', 'lateral', 'central', 'extremo', 'mediocentro', 'delantero']
  const pos = ['desborde constante', 'gol de calidad', 'velocidad punta', 'regate limpio', 'mucha personalidad']
  const neg = ['lento en la salida', 'flojo en el duelo', 'sin ritmo', 'pierde balones', 'poca intensidad']
  let seed = 7
  const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296 }
  const out: ScoutingReport[] = []
  for (let i = 0; i < n; i++) {
    const esLlamar = i % 3 === 0
    const bolsa = esLlamar ? pos : neg
    const frases: string[] = []
    for (let k = 0; k < 6; k++) frases.push(rnd() < 0.7 ? bolsa[Math.floor(rnd() * bolsa.length)] : relleno[Math.floor(rnd() * relleno.length)])
    out.push({
      id: `r${i}`, playerId: `p${i % 40}`, createdAt: `2026-01-${String((i % 28) + 1).padStart(2, '0')}T10:00:00Z`,
      texto: `Informe del jugador visto en el partido: ${frases.join(', ')}. Se recomienda revisar.`,
      conclusion: esLlamar ? (i % 6 === 0 ? 'Firmar' : 'Llamar') : (i % 2 ? 'Seguir' : 'Descartar'),
    })
  }
  return out
}

describe('modeloLlamar', () => {
  it('tokenize quita stopwords y añade bigramas', () => {
    const t = tokenize('El jugador tiene desborde constante')
    expect(t).toContain('desborde')
    expect(t).toContain('desborde constante')
    expect(t).not.toContain('jugador')
  })

  it('«Firmar» legado cuenta como «Llamar»', () => {
    expect(normConclusion('Firmar')).toBe('Llamar')
    expect(normConclusion('')).toBeUndefined()
  })

  it('con pocos informes devuelve motivo en vez de modelo', () => {
    const r = buildModel(generar(20))
    expect(r.ok).toBe(false)
  })

  it('separa Llamar de no-Llamar en datos sintéticos y avisa del progreso', () => {
    const msgs: string[] = []
    const r = buildModel(generar(300), m => msgs.push(m))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.aucCv).toBeGreaterThan(0.8)
    expect(r.nTrain).toBe(300)
    expect(msgs.some(m => m.includes('fold 3/5'))).toBe(true)
    const alto = puntuarTexto(r, 'desborde constante y gol de calidad, velocidad punta, regate limpio')
    const bajo = puntuarTexto(r, 'lento en la salida, flojo en el duelo, sin ritmo, pierde balones')
    expect(alto.p).toBeGreaterThan(bajo.p)
  })

  it('claveModelo cambia con el nº de informes o el más reciente', () => {
    const base = generar(10)
    const k1 = claveModelo(base)
    expect(k1).toBe(claveModelo([...base].reverse()))
    expect(claveModelo(base.slice(0, 9))).not.toBe(k1)
    expect(claveModelo([...base, { id: 'nuevo', playerId: 'x', createdAt: '2027-01-01T00:00:00Z' }])).toContain('nuevo')
  })
})
