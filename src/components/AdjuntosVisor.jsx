import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { FileText, Image as ImageIcon, ExternalLink, Upload, Loader2 } from 'lucide-react'
import {
  CATEGORIAS_ADJUNTO, categoriaLabel, subirAdjuntos, urlAdjunto,
  esImagen, esPdf, ACCEPT_ADJUNTOS, MAX_MB,
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
      <label className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white cursor-pointer ${
        subiendo ? 'bg-blue-400 cursor-wait' : 'bg-blue-600 hover:bg-blue-700'}`}>
        {subiendo ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {subiendo ? 'Subiendo…' : 'Subir archivos'}
        <input type="file" multiple accept={ACCEPT_ADJUNTOS} onChange={onChange} disabled={subiendo} className="hidden" />
      </label>
      {!compacto && <span className="text-xs text-slate-500">PDF, JPG o PNG · máximo {MAX_MB} MB por archivo</span>}
    </div>
  )
}

// Lista de adjuntos agrupada por categoría con vista previa integrada (PDF o imagen),
// pensada para presentar en el comité sin salir de la pantalla.
export default function AdjuntosVisor({ adjuntos = [], onSubidos, alto = 'min-h-[60vh]' }) {
  const [sel, setSel] = useState(adjuntos.length ? 0 : null)
  const [url, setUrl] = useState(null)
  const [cargando, setCargando] = useState(false)
  const actual = sel != null ? adjuntos[sel] : null

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

          <div className="flex flex-col rounded-lg border border-slate-300 bg-slate-100 overflow-hidden min-h-[50vh]">
            {actual && (
              <div className="flex items-center gap-2 px-3 py-2 bg-white border-b border-slate-200">
                <span className="text-xs font-semibold text-slate-500 uppercase">{categoriaLabel(actual.categoria)}</span>
                <span className="text-sm text-slate-800 truncate flex-1">{actual.name}</span>
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
                <img src={url} alt={actual.name} className="max-w-full max-h-[75vh] object-contain" />
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
