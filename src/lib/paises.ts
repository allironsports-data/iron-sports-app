// ── Nacionalidades ───────────────────────────────────────────────────
// Lista cerrada para el campo «Nacionalidad» (components/NacionalidadInput):
// se escribe y se elige. Antes era texto libre y convivían «Spain», «España»,
// «Española», «spain» y «ESPAÑA» para lo mismo. En castellano, nombre del
// país (no el gentilicio). La doble nacionalidad se guarda como
// «España / Marruecos» (ver separarNacionalidades / unirNacionalidades).

export const PAISES: readonly string[] = [
  'España', 'Portugal', 'Francia', 'Italia', 'Alemania', 'Inglaterra', 'Escocia', 'Gales', 'Irlanda', 'Irlanda del Norte',
  'Países Bajos', 'Bélgica', 'Luxemburgo', 'Suiza', 'Austria', 'Dinamarca', 'Suecia', 'Noruega', 'Finlandia', 'Islandia',
  'Polonia', 'Chequia', 'Eslovaquia', 'Hungría', 'Rumanía', 'Bulgaria', 'Grecia', 'Chipre', 'Malta', 'Andorra',
  'Croacia', 'Serbia', 'Bosnia', 'Montenegro', 'Eslovenia', 'Macedonia del Norte', 'Albania', 'Kosovo',
  'Ucrania', 'Rusia', 'Bielorrusia', 'Moldavia', 'Estonia', 'Letonia', 'Lituania', 'Georgia', 'Armenia', 'Azerbaiyán',
  'Turquía', 'Israel', 'Kazajistán', 'Uzbekistán',
  'Marruecos', 'Argelia', 'Túnez', 'Egipto', 'Libia', 'Mauritania', 'Senegal', 'Gambia', 'Guinea', 'Guinea-Bisáu',
  'Guinea Ecuatorial', 'Mali', 'Costa de Marfil', 'Ghana', 'Togo', 'Benín', 'Nigeria', 'Níger', 'Burkina Faso', 'Camerún',
  'Gabón', 'Congo', 'RD Congo', 'Angola', 'Cabo Verde', 'Sierra Leona', 'Liberia', 'Kenia', 'Etiopía', 'Sudáfrica',
  'Zambia', 'Zimbabue', 'Mozambique', 'Uganda', 'Tanzania', 'Ruanda', 'Sudán', 'Chad', 'República Centroafricana',
  'Argentina', 'Brasil', 'Uruguay', 'Chile', 'Colombia', 'Venezuela', 'Ecuador', 'Perú', 'Bolivia', 'Paraguay',
  'México', 'Estados Unidos', 'Canadá', 'Cuba', 'República Dominicana', 'Puerto Rico', 'Haití', 'Jamaica', 'Barbados',
  'Panamá', 'Costa Rica', 'Honduras', 'Guatemala', 'El Salvador', 'Nicaragua',
  'Japón', 'Corea del Sur', 'China', 'Australia', 'Nueva Zelanda', 'Arabia Saudí', 'Catar', 'Emiratos Árabes Unidos',
  'Irán', 'Irak', 'Jordania', 'Líbano', 'Siria', 'Palestina', 'India', 'Pakistán', 'Filipinas', 'Tailandia', 'Indonesia', 'Vietnam',
]

/** «España / Marruecos», «Spain, Morocco», «Española-Uruguaya» → ['España', 'Marruecos'] (sin traducir) */
export function separarNacionalidades(s?: string): string[] {
  return (s ?? '').split(/\s*[/,;|]\s*|\s+-\s+/).map(x => x.trim()).filter(Boolean)
}

/** ['España', 'Marruecos'] → «España / Marruecos» */
export function unirNacionalidades(partes: (string | undefined)[]): string {
  return partes.map(p => (p ?? '').trim()).filter(Boolean).join(' / ')
}
