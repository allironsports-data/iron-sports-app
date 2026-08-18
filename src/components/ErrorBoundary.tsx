import React from 'react'

// ── Red de seguridad de la app ───────────────────────────────────────
// Si un fallo al pintar deja la pantalla en blanco (un dato inesperado,
// una fecha corrupta…), esto lo caza y muestra una pantalla con salida
// en vez del vacío. Sin esto, el usuario solo ve blanco y no sabe si es
// su conexión, su cuenta o la app.

interface Props {
  children: React.ReactNode
  /** Nombre de la zona, para que el aviso diga dónde falló */
  zona?: string
}
interface State {
  error: Error | null
}

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[app] Error al pintar la interfaz:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center">
          <div className="text-3xl">😕</div>
          <h1 className="mt-2 text-base font-semibold text-slate-800">
            Algo se ha roto{this.props.zona ? ` en ${this.props.zona}` : ''}
          </h1>
          <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">
            No es culpa tuya y no se ha perdido nada de lo que ya estaba guardado.
            Recarga la página; si vuelve a pasar en el mismo sitio, avisa con una captura de esta pantalla.
          </p>
          <div className="mt-4 flex items-center justify-center gap-2">
            <button
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-primary/90"
            >
              Recargar
            </button>
            <button
              onClick={() => { window.location.hash = ''; window.location.reload() }}
              className="px-3 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-medium hover:bg-slate-50"
            >
              Volver al inicio
            </button>
          </div>
          <details className="mt-4 text-left">
            <summary className="text-[11px] text-slate-400 cursor-pointer">Detalle técnico</summary>
            <pre className="mt-1 text-[10px] text-slate-500 bg-slate-50 rounded-lg p-2 overflow-x-auto whitespace-pre-wrap break-words">
              {error.message}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
