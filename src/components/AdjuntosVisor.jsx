import { useState, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import { FileText, FileCheck2, Image as ImageIcon, ExternalLink, Upload, Loader2, Paperclip, Trash2, Maximize2 } from 'lucide-react'
import {
  CATEGORIAS_ADJUNTO, categoriaLabel, subirAdjuntos, urlAdjunto,
  esImagen, esPdf, ACCEPT_ADJUNTOS, FORMATOS_ADJUNTOS, MAX_MB,
} from '../lib/adjuntos'

// Selector de categoría + botón para subir archivos. onSubidos recibe las entradas nuevas.
export function SubirAdjuntos({ onSubidos, categoriaInicial = 'historia_clinica', compacto = false }) {
  const [categoria, setCategoria] = useState(categoriaInicial)
  const [subiendo, setSubiendo] = useState(false)

  const onChange = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setSubiendo(true)
    try {
      const nuevos = await subirAdjuntos(files, categoria)
      await onSubidos(nuevos)
      toast.success(`${files.length} archivo(s) agregado(s) a ${categoriaLabel(categoria)}`)
    } catch (err) {
      toast.error(`Error al subir: ${err.message}`)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${compacto ? '' : 'p-3 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50'}`}>
      <select value={categoria} onChange={e => setCategoria(e.target.value)} disabled={subiendo}
        className="px-3 py-2 border-2 border-slate-300 rounded-lg text-sm text-slate-900 bg-white">
        {CATEGORIAS_ADJUNTO.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
      </select>
      <label aria-disabled={subiendo}
        className={`btn-fuerte flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${subiendo ? 'cursor-wait' : 'cursor-pointer'}`}>
        {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {subiendo ? 'Subiendo…' : 'Subir archivos'}
        <input type="file" multiple accept={ACCEPT_ADJUNTOS} onChange={onChange} disabled={subiendo} className="hidden" />
      </label>
      {!compacto && <span className="text-xs text-slate-500">{FORMATOS_ADJUNTOS} · máximo {MAX_MB} MB por archivo</span>}
    </div>
  )
}

// Una fila por tipo de documento, cada una con su propio botón «Adjuntar»
// (sin pasos intermedios). Se usa dentro de cada sección del formulario y en
// el paso final de Adjuntos. onAgregar(nuevos) y onEliminar(path).
export function AdjuntosPorCategoria({ adjuntos = [], categorias, onAgregar, onEliminar }) {
  const [subiendo, setSubiendo] = useState(null)
  const lista = categorias
    ? CATEGORIAS_ADJUNTO.filter(c => categorias.includes(c.value))
    : CATEGORIAS_ADJUNTO

  const subir = async (categoria, e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setSubiendo(categoria)
    try {
      const nuevos = await subirAdjuntos(files, categoria)
      onAgregar(nuevos)
      toast.success(`${files.length} archivo(s) agregado(s) a ${categoriaLabel(categoria)}`)
    } catch (err) {
      toast.error(`Error al subir: ${err.message}`)
    } finally {
      setSubiendo(null)
    }
  }

  return (
    <div className="space-y-2">
      {lista.map(c => {
        const items = adjuntos.filter(f => (f.categoria || 'otro') === c.value)
        const cargando = subiendo === c.value
        return (
          <div key={c.value} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center gap-3">
              <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
              <span className="text-sm font-semibold text-slate-800 flex-1">
                {c.label}
                {items.length > 0 && <span className="ml-1 font-normal text-slate-500">({items.length})</span>}
              </span>
              <label aria-disabled={!!subiendo}
                className={`btn-fuerte flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold shrink-0 ${
                  cargando ? 'cursor-wait' : subiendo ? '' : 'cursor-pointer'}`}>
                {cargando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {cargando ? 'Subiendo…' : 'Adjuntar'}
                <input type="file" multiple accept={ACCEPT_ADJUNTOS} disabled={!!subiendo}
                  onChange={e => subir(c.value, e)} className="hidden" />
              </label>
            </div>
            {items.length > 0 && (
              <div className="mt-2 space-y-1">
                {items.map(f => (
                  <div key={f.path} className="flex items-center gap-2 pl-7 text-sm">
                    <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span className="truncate flex-1 text-slate-800">{f.name}</span>
                    <span className="text-xs text-slate-500 shrink-0">{Math.max(1, Math.round((f.size || 0) / 1024))} KB</span>
                    <button type="button" onClick={() => onEliminar(f.path)}
                      className="flex items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700 shrink-0">
                      <Trash2 className="w-3.5 h-3.5" /> Eliminar
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
      <p className="text-xs text-slate-500">{FORMATOS_ADJUNTOS} · máximo {MAX_MB} MB por archivo · puedes seleccionar varios a la vez</p>
    </div>
  )
}

// Lista de adjuntos agrupada por categoría con vista previa integrada (PDF o imagen),
// pensada para presentar en el comité sin salir de la pantalla.
export default function AdjuntosVisor({ adjuntos = [], onSubidos, alto = 'min-h-[60vh]' }) {
  const [sel, setSel] = useState(adjuntos.length ? 0 : null)
  const [url, setUrl] = useState(null)
  const [cargando, setCargando] = useState(false)
  const visorRef = useRef(null)
  const actual = sel != null ? adjuntos[sel] : null

  // Ampliar solo el documento a pantalla completa (Esc para volver)
  const ampliar = () => {
    if (document.fullscreenElement === visorRef.current) document.exitFullscreen?.()
    else visorRef.current?.requestFullscreen?.().catch(() => toast.error('El navegador no permitió ampliar el documento'))
  }

  useEffect(() => {
    if (sel == null && adjuntos.length) setSel(0)
  }, [adjuntos.length, sel])

  useEffect(() => {
    let vivo = true
    setUrl(null)
    if (!actual) return
    setCargando(true)
    urlAdjunto(actual.path)
      .then(u => { if (vivo) setUrl(u) })
      .catch(e => toast.error(`No se pudo abrir el archivo: ${e.message}`))
      .finally(() => { if (vivo) setCargando(false) })
    return () => { vivo = false }
  }, [actual?.path]) // eslint-disable-line react-hooks/exhaustive-deps

  const grupos = CATEGORIAS_ADJUNTO
    .map(c => ({ ...c, items: adjuntos.map((f, i) => ({ f, i })).filter(({ f }) => (f.categoria || 'otro') === c.value) }))
    .filter(g => g.items.length)

  return (
    <div className="flex-1 flex flex-col gap-3">
      {onSubidos && (
        <SubirAdjuntos compacto onSubidos={async (nuevos) => {
          const total = adjuntos.length
          await onSubidos(nuevos)
          setSel(total)
        }} />
      )}
      {adjuntos.length === 0 ? (
        <p className="text-sm text-slate-500">Este caso no tiene adjuntos. Sube la historia clínica, patologías o imágenes.</p>
      ) : (
        <div className={`flex-1 grid grid-cols-1 lg:grid-cols-[18rem_1fr] gap-3 ${alto}`}>
          <div className="space-y-3 overflow-y-auto lg:max-h-[75vh]">
            {grupos.map(g => (
              <div key={g.value}>
                <div className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-1">
                  {g.label} ({g.items.length})
                </div>
                <div className="space-y-1">
                  {g.items.map(({ f, i }) => {
                    const Icon = esImagen(f) ? ImageIcon : FileText
                    return (
                      <button key={f.path} type="button" onClick={() => setSel(i)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg border text-left text-sm transition-colors ${
                          i === sel ? 'bg-blue-600 border-blue-600 text-white' : 'bg-slate-50 border-slate-200 text-slate-800 hover:bg-blue-50'}`}>
                        <Icon className="w-4 h-4 shrink-0" />
                        <span className="truncate">{f.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div ref={visorRef} className="flex flex-col rounded-lg border border-slate-300 bg-slate-100 overflow-hidden min-h-[50vh]">
            {actual && (
              <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase">{categoriaLabel(actual.categoria)}</span>
                <span className="text-sm text-slate-800 truncate flex-1">{actual.name}</span>
                {url && (esPdf(actual) || esImagen(actual)) && (
                  <button type="button" onClick={ampliar}
                    className="btn-fuerte flex items-center gap-1 !px-2.5 !py-1 rounded-md !text-xs font-semibold shrink-0">
                    <Maximize2 className="w-3.5 h-3.5" /> Ampliar
                  </button>
                )}
                {url && (
                  <a href={url} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline shrink-0">
                    <ExternalLink className="w-3.5 h-3.5" /> Abrir en otra pestaña
                  </a>
                )}
              </div>
            )}
            <div className="flex-1 flex items-center justify-center">
              {cargando && <Loader2 className="w-6 h-6 animate-spin text-slate-500" />}
              {!cargando && url && esPdf(actual) && (
                <iframe src={url} title={actual.name} className="w-full h-full min-h-[50vh] bg-white" />
              )}
              {!cargando && url && esImagen(actual) && (
                <img src={url} alt={actual.name} className="max-w-full max-h-[75vh] object-contain [:fullscreen_&]:max-h-full" />
              )}
              {!cargando && url && !esPdf(actual) && !esImagen(actual) && (
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-700 hover:underline">
                  Este formato no se puede previsualizar. Abrir el archivo
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
