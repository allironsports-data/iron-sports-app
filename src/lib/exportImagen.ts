import { toPng } from 'html-to-image'

// ── Descargar un trozo de pantalla como imagen ───────────────────────
// Los campogramas (SVG de fondo + jugadores superpuestos) no son un
// <canvas> ni una imagen real, así que para "descargar la imagen" hay
// que capturar ese trozo del DOM tal cual se ve y convertirlo a PNG.

/**
 * Descarga un elemento del DOM como PNG. `pixelRatio: 2` para que se lea
 * bien al imprimir o hacer zoom (el campograma es pequeño en pantalla).
 *
 * Hay que pasar `width`/`height` explícitos (los del propio elemento):
 * sin ellos, html-to-image clona el nodo fuera del layout de la página y
 * el `max-w-[...]` del campograma se resuelve contra un ancho distinto,
 * así que la imagen sale descentrada y cortada por el lado derecho.
 */
export async function descargarComoImagen(el: HTMLElement, nombreArchivo: string): Promise<void> {
  const rect = el.getBoundingClientRect()
  const dataUrl = await toPng(el, {
    pixelRatio: 2,
    cacheBust: true,
    width: rect.width,
    height: rect.height,
    style: { margin: '0' },
  })
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = nombreArchivo.endsWith('.png') ? nombreArchivo : `${nombreArchivo}.png`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

/** Convierte texto libre en un nombre de archivo seguro (sin tildes, espacios → _). */
export function nombreArchivoSeguro(texto: string): string {
  return texto
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}
