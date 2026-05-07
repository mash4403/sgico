import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { formatDate } from '../lib/utils'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Printer, Gavel, Clock, FileText, Download,
  Building2, User, Stethoscope, HeartPulse, FlaskConical,
  Pill, BookOpen, MessageSquareQuote, Paperclip,
  CheckCircle2, XCircle, AlertCircle, Loader2,
} from 'lucide-react'

const ESTADO_LABELS = {
  pendiente:   { label: 'Pendiente',      color: 'bg-amber-100 text-amber-700 ring-amber-300',     icon: Clock },
  en_revision: { label: 'En revisión',    color: 'bg-blue-100 text-blue-700 ring-blue-300',         icon: Loader2 },
  aprobado:    { label: 'Aprobado',       color: 'bg-emerald-100 text-emerald-700 ring-emerald-300', icon: CheckCircle2 },
  rechazado:   { label: 'Rechazado',      color: 'bg-rose-100 text-rose-700 ring-rose-300',         icon: XCircle },
  aplazado:    { label: 'Aplazado',       color: 'bg-slate-100 text-slate-700 ring-slate-300',      icon: AlertCircle },
  otra:        { label: 'Otra decisión',  color: 'bg-purple-100 text-purple-700 ring-purple-300',   icon: AlertCircle },
}

const PRIORIDAD_LABELS = {
  normal:  { label: 'Normal',  color: 'bg-slate-100 text-slate-700' },
  urgente: { label: 'Urgente', color: 'bg-orange-100 text-orange-700' },
  critica: { label: 'Crítica', color: 'bg-red-100 text-red-700' },
}

const TIPO_COMITE_LABELS = {
  tumor_solido:       'Tumor sólido',
  hematologico:       'Hematológico',
  multidisciplinario: 'Multidisciplinario',
}

const ECOG_LABELS = {
  '0': '0 — Asintomático, totalmente activo',
  '1': '1 — Síntomas leves, ambulatorio',
  '2': '2 — Encamado <50% del día',
  '3': '3 — Encamado >50% del día',
  '4': '4 — Postrado, no se autocuida',
}

const TABACO_LABELS = { nunca: 'Nunca fumó', exfumador: 'Exfumador', activo: 'Fumador activo' }
const ALCOHOL_LABELS = {
  nunca: 'No consume', social: 'Social ocasional',
  frecuente: 'Frecuente', abuso: 'Abuso/dependencia',
}
const EVIDENCIA_LABELS = {
  fase_3: 'Ensayo fase III', fase_2: 'Ensayo fase II',
  metanalisis: 'Metaanálisis', guia: 'Guía de práctica clínica',
  consenso: 'Consenso de expertos', real_world: 'Evidencia del mundo real',
}
const GENERO_LABELS = { M: 'Masculino', F: 'Femenino', I: 'Indeterminado' }

export default function CasoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caso, setCaso] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistorial, setShowHistorial] = useState(false)

  useEffect(() => { cargarCaso() }, [id])

  async function cargarCaso() {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('casos_comite')
        .select(`
          *,
          paciente:pacientes(*),
          sede:sedes(id, nombre),
          medico:medicos(id, nombre, especialidad),
          gestor:gestores(id, nombre),
          protocolo:protocolos(id, nombre, estudio_pivotal, pfs_esperado_meses, os_esperado_meses)
        `)
        .eq('id', id)
        .single()
      if (error) throw error

      let eps = null
      if (data.paciente?.eps_id) {
        const { data: e } = await supabase
          .from('eps').select('id, nombre').eq('id', data.paciente.eps_id).single()
        eps = e
      }

      setCaso({ ...data, eps })

      const { data: hist } = await supabase
        .from('casos_historial')
        .select('*')
        .eq('caso_id', id)
        .order('created_at', { ascending: false })
      setHistorial(hist || [])
    } catch (e) {
      toast.error(`No se pudo cargar el caso: ${e.message}`)
      navigate('/casos')
    } finally {
      setLoading(false)
    }
  }

  const edad = useMemo(() => {
    if (!caso?.paciente?.fecha_nacimiento) return null
    const fn = new Date(caso.paciente.fecha_nacimiento)
    const hoy = new Date()
    let e = hoy.getFullYear() - fn.getFullYear()
    const m = hoy.getMonth() - fn.getMonth()
    if (m < 0 || (m === 0 && hoy.getDate() < fn.getDate())) e--
    return e
  }, [caso])

  const imprimir = () => window.print()

  const descargarAdjunto = async (path, nombre) => {
    try {
      const { data, error } = await supabase.storage
        .from('adjuntos').createSignedUrl(path, 60)
      if (error) throw error
      const a = document.createElement('a')
      a.href = data.signedUrl
      a.download = nombre
      a.click()
    } catch (e) {
      toast.error(`No se pudo descargar: ${e.message}`)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
      </div>
    )
  }
  if (!caso) return null

  const estado = ESTADO_LABELS[caso.estado] || ESTADO_LABELS.pendiente
  const EstadoIcon = estado.icon
  const prioridad = PRIORIDAD_LABELS[caso.prioridad] || PRIORIDAD_LABELS.normal
  const puedeAbrirComite = caso.estado === 'pendiente' || caso.estado === 'en_revision'

  // Telefono real puede estar en telefono1 o telefono2
  const telefono = caso.paciente?.telefono1 || caso.paciente?.telefono2

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 print:p-0 print:max-w-full">
      {/* Header — oculto en impresión */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 print:hidden">
        <button onClick={() => navigate('/casos')}
          className="flex items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" /> Volver al listado
        </button>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowHistorial(s => !s)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm">
            <Clock className="w-4 h-4" />
            {showHistorial ? 'Ocultar' : 'Ver'} historial
          </button>
          <button onClick={imprimir}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 text-sm">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
          <button disabled={!puedeAbrirComite}
            title={puedeAbrirComite ? 'Abrir mesa de comité' : 'Caso ya decidido'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            onClick={() => toast('Mesa de comité — próximamente', { icon: '🔜' })}>
            <Gavel className="w-4 h-4" /> Abrir mesa de comité
          </button>
        </div>
      </div>

      {/* Cabecera del caso */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6 print:shadow-none print:border print:rounded-none">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ring-1 ${estado.color}`}>
                <EstadoIcon className="w-3.5 h-3.5" />
                {estado.label}
              </span>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${prioridad.color}`}>
                Prioridad: {prioridad.label}
              </span>
              {caso.tipo_comite && (
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">
                  {TIPO_COMITE_LABELS[caso.tipo_comite] || caso.tipo_comite}
                </span>
              )}
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">
              {caso.paciente?.nombre || '—'}
            </h1>
            <div className="text-sm text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
              <span>{caso.paciente?.tipo_documento} {caso.paciente?.documento}</span>
              {edad !== null && <span>· {edad} años</span>}
              {caso.paciente?.genero && <span>· {GENERO_LABELS[caso.paciente.genero]}</span>}
            </div>
          </div>
          <div className="text-right text-sm text-slate-500 shrink-0">
            <div className="text-xs uppercase tracking-wide">Caso</div>
            <div className="font-bold text-slate-700 text-lg">#{caso.id}</div>
            <div className="mt-1">Solicitado: <strong className="text-slate-700">{formatDate(caso.fecha_solicitud)}</strong></div>
          </div>
        </div>
      </div>

      <Section title="Datos administrativos" icon={Building2}>
        <KV label="Sede"            value={caso.sede?.nombre} />
        <KV label="EPS"             value={caso.eps?.nombre} />
        <KV label="Médico solicitante" value={[caso.medico?.nombre, caso.medico?.especialidad].filter(Boolean).join(' — ')} />
        <KV label="Gestor de caso"  value={caso.gestor?.nombre} />
        <KV label="Tipo de comité"  value={TIPO_COMITE_LABELS[caso.tipo_comite] || caso.tipo_comite} />
        <KV label="Prioridad"       value={prioridad.label} />
        <KV label="Fecha solicitud" value={formatDate(caso.fecha_solicitud)} />
      </Section>

      <Section title="Datos del paciente" icon={User}>
        <KV label="Nombre"            value={caso.paciente?.nombre} />
        <KV label="Documento"         value={`${caso.paciente?.tipo_documento || ''} ${caso.paciente?.documento || ''}`.trim()} />
        <KV label="Fecha nacimiento"  value={formatDate(caso.paciente?.fecha_nacimiento)} />
        <KV label="Edad"              value={edad !== null ? `${edad} años` : null} />
        <KV label="Género"            value={GENERO_LABELS[caso.paciente?.genero]} />
        <KV label="Teléfono"          value={telefono} />
      </Section>

      <Section title="Diagnóstico oncológico" icon={Stethoscope}>
        <KV label="Código CIE-10"          value={caso.cie10 || caso.protocolo?.cie10} />
        <KV label="Fecha diagnóstico"      value={formatDate(caso.fecha_diagnostico)} />
        <KV label="Descripción"            value={caso.diagnostico_descripcion} full />
        <KV label="Histología"             value={caso.histologia} full />
        <KV label="Estadio clínico"        value={caso.estadio_clinico ? `Estadio ${caso.estadio_clinico}` : null} />
        <KV label="TNM"                    value={caso.tnm} />
        <KV label="Biomarcadores"          value={caso.biomarcadores} full />
      </Section>

      <Section title="Antecedentes y comorbilidades" icon={HeartPulse}>
        <KV label="ECOG"               value={ECOG_LABELS[caso.ecog] || caso.ecog} />
        <KV label="Hábito tabáquico"   value={TABACO_LABELS[caso.habito_tabaquico] || caso.habito_tabaquico} />
        <KV label="Hábito alcohólico"  value={ALCOHOL_LABELS[caso.habito_alcohol] || caso.habito_alcohol} />
        <KV label="Comorbilidades"     value={caso.comorbilidades} full />
        <KV label="Alergias"           value={caso.alergias} full />
        <KV label="Medicación actual"  value={caso.medicacion_actual} full />
      </Section>

      <Section title="Estudios e imágenes" icon={FlaskConical}>
        <KV label="Imágenes diagnósticas" value={caso.estudios_imagenes} full />
        <KV label="Laboratorio"           value={caso.estudios_laboratorio} full />
        <KV label="Patología"             value={caso.estudios_patologia} full />
        <KV label="Estudios moleculares"  value={caso.estudios_moleculares} full />
        <KV label="Fecha último estudio"  value={formatDate(caso.fecha_ultimo_estudio)} />
      </Section>

      <Section title="Tratamientos previos" icon={Pill}>
        <KV label="Línea actual"        value={caso.linea_actual != null ? `Línea ${caso.linea_actual}` : null} />
        <KV label="Molécula previa"     value={caso.molecula_previa} />
        <KV label="Quirúrgico"          value={caso.tratamiento_quirurgico} full />
        <KV label="Quimioterapia"       value={caso.tratamiento_qt} full />
        <KV label="Radioterapia"        value={caso.tratamiento_rt} full />
        <KV label="Terapia dirigida"    value={caso.tratamiento_dirigido} full />
        <KV label="Respuesta previa"    value={caso.respuesta_previa} full />
      </Section>

      <Section title="Estudio que avala la solicitud" icon={BookOpen}>
        <KV label="Protocolo / régimen" value={caso.protocolo?.nombre} full />
        <KV label="Estudio pivotal"     value={caso.evidencia_referencia || caso.protocolo?.estudio_pivotal} />
        <KV label="Tipo de evidencia"   value={EVIDENCIA_LABELS[caso.evidencia_tipo] || caso.evidencia_tipo} />
        <KV label="PFS esperado"        value={caso.pfs_esperado_estudio ? `${caso.pfs_esperado_estudio} meses` : null} />
        <KV label="OS esperado"         value={caso.os_esperado_estudio ? `${caso.os_esperado_estudio} meses` : null} />
        {caso.evidencia_link && (
          <div className="md:col-span-2">
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">Enlace al estudio</div>
            <a href={caso.evidencia_link} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-600 hover:underline break-all">
              {caso.evidencia_link}
            </a>
          </div>
        )}
      </Section>

      <Section title="Pregunta al comité" icon={MessageSquareQuote} highlight>
        <KV label="Pregunta específica"  value={caso.pregunta_comite || caso.motivo} full />
        <KV label="Línea propuesta"      value={caso.linea_propuesta != null ? `Línea ${caso.linea_propuesta}` : null} />
        <KV label="Costo estimado"
            value={caso.costo_estimado != null
              ? `$ ${Number(caso.costo_estimado).toLocaleString('es-CO')} COP`
              : null} />
        <KV label="Tratamiento propuesto" value={caso.tratamiento_propuesto || caso.molecula_propuesta} full />
        <KV label="Justificación clínica" value={caso.justificacion_clinica || caso.justificacion} full />
      </Section>

      {caso.adjuntos?.length > 0 && (
        <Section title={`Adjuntos (${caso.adjuntos.length})`} icon={Paperclip}>
          <div className="md:col-span-2 space-y-2 print:hidden">
            {caso.adjuntos.map((f, i) => (
              <button key={i} onClick={() => descargarAdjunto(f.path, f.name)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors text-left">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-sm text-slate-700 truncate">{f.name}</span>
                  <span className="text-xs text-slate-400 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <Download className="w-4 h-4 text-blue-600 shrink-0 ml-2" />
              </button>
            ))}
          </div>
          <div className="md:col-span-2 hidden print:block">
            <ul className="text-sm text-slate-700 list-disc pl-5">
              {caso.adjuntos.map((f, i) => <li key={i}>{f.name}</li>)}
            </ul>
          </div>
        </Section>
      )}

      {showHistorial && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6 print:hidden">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
            <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">Historial de cambios</h2>
              <p className="text-sm text-slate-500">{historial.length} eventos registrados</p>
            </div>
          </div>
          {historial.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-6">Sin cambios registrados.</p>
          ) : (
            <ol className="relative border-l-2 border-slate-200 ml-2 space-y-4">
              {historial.map(h => (
                <li key={h.id} className="ml-4">
                  <div className="absolute -left-[7px] w-3 h-3 rounded-full bg-blue-500 border-2 border-white" />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 mb-1">
                    <span className="text-sm font-semibold text-slate-800">
                      {h.accion === 'crear'      && 'Caso creado'}
                      {h.accion === 'actualizar' && 'Caso actualizado'}
                      {h.accion === 'eliminar'   && 'Caso eliminado'}
                    </span>
                    <span className="text-xs text-slate-500">
                      {new Date(h.created_at).toLocaleString('es-CO')}
                      {h.usuario_email && ` · ${h.usuario_email}`}
                    </span>
                  </div>
                  {h.cambios && Object.keys(h.cambios).length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-3 text-xs">
                      {Object.entries(h.cambios).map(([campo, val]) => (
                        <div key={campo} className="py-1">
                          <span className="font-mono font-semibold text-slate-700">{campo}</span>
                          <span className="text-slate-400 mx-1">:</span>
                          <span className="text-rose-600 line-through">{formatVal(val.antes)}</span>
                          <span className="text-slate-400 mx-1">→</span>
                          <span className="text-emerald-600 font-medium">{formatVal(val.despues)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      <style>{`
        @media print {
          @page { margin: 1.5cm; size: A4; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:p-0 { padding: 0 !important; }
          .print\\:max-w-full { max-width: 100% !important; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:rounded-none { border-radius: 0 !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  )
}

function Section({ title, icon: Icon, children, highlight = false }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border mb-6 p-6 print:shadow-none print:border print:rounded-none print:break-inside-avoid ${
      highlight ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-200'
    }`}>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-100">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          highlight ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-800">{title}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">{children}</div>
    </div>
  )
}

function KV({ label, value, full = false }) {
  const display = (value === null || value === undefined || value === '')
    ? <span className="text-slate-400 italic">No registrado</span>
    : value === 'No aplica'
      ? <span className="text-slate-500 italic">No aplica</span>
      : <span className="text-slate-900 whitespace-pre-line">{value}</span>
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm">{display}</div>
    </div>
  )
}

function formatVal(v) {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 50)
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}
