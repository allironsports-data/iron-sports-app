// Validaciones compartidas para formularios

/** URL http(s) válida. Acepta "www.x.com" (se asume https). */
export function isValidUrl(value: string): boolean {
  if (!value.trim()) return false;
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const u = new URL(candidate);
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

/** Normaliza una URL añadiendo https:// si falta. */
export function normalizeUrl(value: string): string {
  const v = value.trim();
  if (!v) return v;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** Fecha ISO (yyyy-mm-dd) válida y no futura — para fechas de nacimiento. */
export function isValidBirthDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(value + "T00:00:00");
  if (isNaN(d.getTime())) return false;
  const now = new Date();
  const min = new Date(now.getFullYear() - 60, now.getMonth(), now.getDate());
  return d <= now && d >= min;
}

/** Fecha ISO válida (sin restricción de rango). */
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return !isNaN(new Date(value + "T00:00:00").getTime());
}

/** Nombre con longitud mínima razonable. */
export function isValidName(value: string): boolean {
  return value.trim().length >= 2;
}
