import { Component } from 'react'

// Evita la pantalla en blanco ante un error de la interfaz. No muestra
// datos del caso: solo el mensaje técnico, para reportarlo.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('SGICO: error de interfaz', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-lg font-semibold">Algo salió mal en esta pantalla</h1>
          <p className="text-sm text-slate-500">
            Lo que ya estaba guardado no se perdió. Recarga la página; si vuelve a pasar,
            avisa al soporte con este mensaje:
          </p>
          <code className="block text-xs bg-slate-100 text-slate-700 rounded p-2 break-words">
            {String(this.state.error?.message || this.state.error)}
          </code>
          <button type="button" onClick={() => window.location.assign('/')}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold">
            Volver al inicio
          </button>
        </div>
      </div>
    )
  }
}
