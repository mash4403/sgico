import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  formatDate, generarTextoHistoriaClinica,
  mensajeCostoPrevio, mensajeSinDiferencial,
} from '../lib/utils'
import { copiarTextoAlPortapapeles } from '../lib/clipboard'
import toast from 'react-hot-toast'
import {
  ArrowLeft, Printer, Gavel, Clock, FileText, Download,
  Building2, User, Stethoscope, HeartPulse, FlaskConical,
  Pill, BookOpen, MessageSquareQuote, DollarSign, Paperclip,
  CheckCircle2, XCircle, AlertCircle, Loader2, ShieldCheck, ClipboardCopy,
} from 'lucide-react'

const DECISION_LABELS = {
  pendiente:      { label: 'Pendiente de comité', color: 'bg-amber-100 text-amber-800 ring-amber-300',     icon: Clock },
  aprobado:       { label: 'Aprobado',            color: 'bg-emerald-100 text-emerald-800 ring-emerald-300', icon: CheckCircle2 },
  rechazado:      { label: 'Rechazado',           color: 'bg-rose-100 text-rose-800 ring-rose-300',         icon: XCircle },
  modificado:     { label: 'Aprobado con modif.', color: 'bg-blue-100 text-blue-800 ring-blue-300',         icon: CheckCircle2 },
  diferido:       { label: 'Diferido',            color: 'bg-slate-200 text-slate-800 ring-slate-400',      icon: AlertCircle },
  pendiente_info: { label: 'Pendiente info',      color: 'bg-purple-100 text-purple-800 ring-purple-300',   icon: AlertCircle },
}

const PRIORIDAD_LABELS = {
  normal:  { label: 'Normal',  color: 'bg-slate-200 text-slate-800' },
  urgente: { label: 'Urgente', color: 'bg-orange-100 text-orange-800' },
  critica: { label: 'Crítica', color: 'bg-red-100 text-red-800' },
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

const fmtCOP = (n) => n == null ? '—' : '$ ' + Number(n).toLocaleString('es-CO') + ' COP'

export default function CasoDetalle() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [caso, setCaso] = useState(null)
  const [acta, setActa] = useState(null)
  const [historial, setHistorial] = useState([])
  const [loading, setLoading] = useState(true)
  const [showHistorial, setShowHistorial] = useState(false)

  useEffect(() => { cargarCaso() }, [id]) // eslint-disable-line react-hooks/exhaustive-deps

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

      // Acta del comité (puede no existir todavía)
      const { data: actaData } = await supabase
        .from('actas_comite')
        .select('*')
        .eq('caso_id', id)
        .maybeSingle()
      setActa(actaData || null)
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

  async function copiarAHistoriaClinica() {
    const texto = generarTextoHistoriaClinica(caso, acta)
    try {
      await copiarTextoAlPortapapeles(texto)
      toast.success('Texto copiado. Pégalo en la historia clínica.')
    } catch {
      toast.error('No se pudo copiar automáticamente. Texto: ' + texto, { duration: 12000 })
    }
  }

  const descargarAdjunto = async (path, nombre) => {
  try {
    const { data, error } = await supabase.storage
      .from('adjuntos').createSignedUrl(path, 60)
    if (error) throw error
    // Abrir en nueva pestaña — preserva la app, no más 404 al volver
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  } catch (e) {
    toast.error(`No se pudo abrir el archivo: ${e.message}`)
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

  const decision = DECISION_LABELS[caso.decision] || DECISION_LABELS.pendiente
  const DecisionIcon = decision.icon
  const prioridad = PRIORIDAD_LABELS[caso.prioridad] || PRIORIDAD_LABELS.normal
  const puedeAbrirComite = caso.decision === 'pendiente' || caso.decision === 'pendiente_info'
  const telefono = caso.paciente?.telefono1 || caso.paciente?.telefono2

  // Datos del paciente actual: tratamiento_qt en BD = quimioterapia + líneas previas en el form nuevo
  const tratamientoActualMolecula = caso.molecula_previa
  const quimioYLineasPrevias      = caso.tratamiento_qt

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6 print:p-0 print:max-w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 print:hidden">
        <button onClick={() => navigate('/casos')}
          className="flex items-center gap-2 text-sm text-slate-700 hover:text-slate-900 font-medium">
          <ArrowLeft className="w-4 h-4" /> Volver al listado
        </button>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowHistorial(s => !s)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-400 text-slate-800 hover:bg-slate-50 text-sm font-medium">
            <Clock className="w-4 h-4" />
            {showHistorial ? 'Ocultar' : 'Ver'} historial
          </button>
          <button onClick={imprimir}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-400 text-slate-800 hover:bg-slate-50 text-sm font-medium">
            <Printer className="w-4 h-4" /> Imprimir / PDF
          </button>
          {acta && (
            <button onClick={copiarAHistoriaClinica}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-400 text-slate-800 hover:bg-slate-50 text-sm font-medium">
              <ClipboardCopy className="w-4 h-4" /> Copiar a historia clínica
            </button>
          )}
          <button
            title={puedeAbrirComite ? 'Abrir mesa de comité' : 'Ver acta del comité'}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 text-sm font-medium"
            onClick={() => navigate(`/casos/${caso.id}/acta`)}>
            <Gavel className="w-4 h-4" /> {puedeAbrirComite ? 'Abrir mesa de comité' : 'Ver acta del comité'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-6 mb-6 print:shadow-none print:border print:rounded-none">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold ring-1 ${decision.color}`}>
                <DecisionIcon className="w-3.5 h-3.5" />
                {decision.label}
              </span>
              <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${prioridad.color}`}>
                Prioridad: {prioridad.label}
              </span>
              {caso.tipo_comite && (
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 text-indigo-800">
                  {TIPO_COMITE_LABELS[caso.tipo_comite] || caso.tipo_comite}
                </span>
              )}
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-slate-900 mb-1">
              {caso.paciente?.nombre || '—'}
            </h1>
            <div className="text-sm text-slate-700 flex flex-wrap gap-x-4 gap-y-1">
              <span>{caso.paciente?.tipo_documento} {caso.paciente?.documento}</span>
              {edad !== null && <span>· {edad} años</span>}
              {caso.paciente?.genero && <span>· {GENERO_LABELS[caso.paciente.genero]}</span>}
            </div>
          </div>
          <div className="text-right text-sm text-slate-600 shrink-0">
            <div className="text-xs uppercase tracking-wide font-semibold">Caso</div>
            <div className="font-bold text-slate-900 text-lg">#{caso.id}</div>
            <div className="mt-1">Solicitado: <strong className="text-slate-800">{formatDate(caso.fecha_solicitud)}</strong></div>
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

      <Section title="Tratamientos previos y actual" icon={Pill}>
        <KV label="Línea actual"        value={caso.linea_actual != null ? `Línea ${caso.linea_actual}` : null} />
        <KV label="Tratamiento actual"  value={tratamientoActualMolecula} />
        <KV label="Quimioterapia y líneas previas" value={quimioYLineasPrevias} full />
        <KV label="Quirúrgico"          value={caso.tratamiento_quirurgico} full />
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
            <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">Enlace al estudio</div>
            <a href={caso.evidencia_link} target="_blank" rel="noopener noreferrer"
              className="text-sm text-blue-700 hover:underline break-all">
              {caso.evidencia_link}
            </a>
          </div>
        )}
      </Section>

      <Section title="Pregunta al comité" icon={MessageSquareQuote} highlight>
        <KV label="Pregunta específica"  value={caso.pregunta_comite || caso.motivo} full />
        <KV label="Línea propuesta"      value={caso.linea_propuesta != null ? `Línea ${caso.linea_propuesta}` : null} />
        <div />
        <KV label="Tratamiento propuesto" value={caso.tratamiento_propuesto || caso.molecula_propuesta} full />
        <KV label="Justificación clínica" value={caso.justificacion_clinica || caso.justificacion} full />
      </Section>

      {caso.proyeccion_costos && (
        <ProyeccionCostosSection proyeccion={caso.proyeccion_costos} />
      )}

      {(caso.tiene_invima != null || caso.en_unirse != null) && (
        <Section title="Estatus regulatorio" icon={ShieldCheck}>
          <div className="md:col-span-2 flex flex-wrap gap-3">
            {caso.tiene_invima === true && <Badge color="emerald">✅ INVIMA vigente</Badge>}
            {caso.tiene_invima === false && <Badge color="rose">⚠️ Sin INVIMA</Badge>}
            {caso.en_unirse === true && <Badge color="blue">📋 En base UNIRS</Badge>}
            {caso.en_unirse === false && <Badge color="slate">📋 No está en UNIRS</Badge>}
          </div>
        </Section>
      )}

      {caso.adjuntos?.length > 0 && (
        <Section title={`Adjuntos (${caso.adjuntos.length})`} icon={Paperclip}>
          <div className="md:col-span-2 space-y-2 print:hidden">
            {caso.adjuntos.map((f, i) => (
              <button key={i} onClick={() => descargarAdjunto(f.path, f.name)}
                className="w-full flex items-center justify-between p-3 bg-slate-50 hover:bg-blue-50 rounded-lg transition-colors text-left border border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-slate-600 shrink-0" />
                  <span className="text-sm text-slate-800 truncate">{f.name}</span>
                  <span className="text-xs text-slate-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <FileText className="w-4 h-4 text-blue-600 shrink-0 ml-2" title="Abrir en nueva pestaña" />
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
        <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-6 mb-6 print:hidden">
          <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
            <div className="w-10 h-10 rounded-lg bg-slate-200 text-slate-700 flex items-center justify-center">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">Historial de cambios</h2>
              <p className="text-sm text-slate-600">{historial.length} eventos registrados</p>
            </div>
          </div>
          {historial.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-6">Sin cambios registrados.</p>
          ) : (
            <ol className="relative border-l-2 border-slate-300 ml-2 space-y-4">
              {historial.map(h => (
                <li key={h.id} className="ml-4">
                  <div className="absolute -left-[7px] w-3 h-3 rounded-full bg-blue-600 border-2 border-white" />
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 mb-1">
                    <span className="text-sm font-semibold text-slate-900">
                      {h.accion === 'crear'      && 'Caso creado'}
                      {h.accion === 'actualizar' && 'Caso actualizado'}
                      {h.accion === 'eliminar'   && 'Caso eliminado'}
                    </span>
                    <span className="text-xs text-slate-600">
                      {new Date(h.created_at).toLocaleString('es-CO')}
                      {h.usuario_email && ` · ${h.usuario_email}`}
                    </span>
                  </div>
                  {h.cambios && Object.keys(h.cambios).length > 0 && (
                    <div className="bg-slate-50 rounded-lg p-3 text-xs border border-slate-200">
                      {Object.entries(h.cambios).map(([campo, val]) => (
                        <div key={campo} className="py-1">
                          <span className="font-mono font-semibold text-slate-800">{campo}</span>
                          <span className="text-slate-500 mx-1">:</span>
                          <span className="text-rose-700 line-through">{formatVal(val.antes)}</span>
                          <span className="text-slate-500 mx-1">→</span>
                          <span className="text-emerald-700 font-medium">{formatVal(val.despues)}</span>
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

/* ──────────────────────────────────────────────────────────────
   Sección de proyección — solo PFS para cálculo, OS atenuado
   ────────────────────────────────────────────────────────────── */
function ProyeccionCostosSection({ proyeccion }) {
  const p = proyeccion
  const naive = p.diferencial?.es_naive
  const motivo = p.diferencial?.motivo_sin_diferencial

  return (
    <div className="bg-white rounded-2xl shadow-sm border-2 border-blue-300 mb-6 p-6 print:shadow-none print:border print:rounded-none print:break-inside-avoid">
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-blue-200">
        <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
          <DollarSign className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-bold text-slate-900">Proyección de impacto económico</h2>
          <p className="text-xs text-slate-600">Cálculo basado en PFS · OS mostrado solo como referencia clínica</p>
        </div>
        <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-1 rounded shrink-0">
          PFS
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        {/* ACTUAL */}
        <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
          <div className="text-xs font-bold text-slate-700 uppercase mb-3">🩺 Tratamiento actual</div>
          {p.actual?.pfs_meses == null ? (
            <div className="text-sm text-slate-500 italic py-3">
              {mensajeCostoPrevio(motivo)}
            </div>
          ) : (
            <>
              <ProyRow label="Costo por ciclo" value={fmtCOP(p.actual?.costo_ciclo)} />
              <ProyRow label="Duración del ciclo" value={`${p.actual?.duracion_dias} días`} />
              <ProyRow label="PFS estimado" value={`${p.actual?.pfs_meses} meses`} />
              <hr className="my-2 border-slate-300" />
              <ProyRow label={`Costo total PFS (${p.actual?.ciclos_pfs} ciclos)`}
                value={fmtCOP(p.actual?.total_pfs)} bold />
              {p.actual?.os_meses != null && (
                <div className="opacity-50 mt-2 pt-2 border-t border-slate-200">
                  <div className="text-[10px] uppercase font-semibold text-slate-500 mb-1">Referencia OS</div>
                  <ProyRow label={`OS estimado`} value={`${p.actual.os_meses} meses`} small />
                  <ProyRow label={`Costo total OS (${p.actual.ciclos_os} ciclos)`}
                    value={fmtCOP(p.actual.total_os)} small />
                </div>
              )}
            </>
          )}
        </div>

        {/* PROPUESTO */}
        <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
          <div className="text-xs font-bold text-blue-800 uppercase mb-3">💊 Tratamiento propuesto</div>
          <ProyRow label="Costo por ciclo" value={fmtCOP(p.propuesto?.costo_ciclo)} />
          <ProyRow label="Duración del ciclo" value={`${p.propuesto?.duracion_dias} días`} />
          <ProyRow label="PFS esperado" value={`${p.propuesto?.pfs_meses} meses`} />
          <hr className="my-2 border-blue-300" />
          <ProyRow label={`Costo total PFS (${p.propuesto?.ciclos_pfs} ciclos)`}
            value={fmtCOP(p.propuesto?.total_pfs)} bold />
          {p.propuesto?.os_meses != null && (
            <div className="opacity-50 mt-2 pt-2 border-t border-blue-200">
              <div className="text-[10px] uppercase font-semibold text-blue-700 mb-1">Referencia OS</div>
              <ProyRow label={`OS esperado`} value={`${p.propuesto.os_meses} meses`} small />
              <ProyRow label={`Costo total OS (${p.propuesto.ciclos_os} ciclos)`}
                value={fmtCOP(p.propuesto.total_os)} small />
            </div>
          )}
        </div>
      </div>

      <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-lg p-4 border-2 border-amber-200">
        <div className="text-xs font-bold text-amber-900 uppercase mb-3">
          ⚖️ Diferencial (propuesto − actual)
        </div>
        {naive ? (
          <div className="text-sm text-slate-700 italic">
            {mensajeSinDiferencial(motivo)}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <DiffBox label="Diferencia hasta progresión (PFS)" value={p.diferencial?.diferencia_pfs} />
            <DiffBox label={`Costo por mes de PFS ganado (+${p.diferencial?.ganancia_pfs_meses ?? 0}m)`}
              value={p.diferencial?.costo_por_mes_pfs_ganado} />
          </div>
        )}
      </div>
    </div>
  )
}

function ProyRow({ label, value, bold, small }) {
  return (
    <div className="flex justify-between items-baseline gap-2 py-0.5">
      <span className={`text-slate-700 ${small ? 'text-[11px]' : 'text-xs'}`}>{label}</span>
      <span className={`text-slate-900 ${small ? 'text-[11px]' : 'text-sm'} ${bold ? 'font-bold' : ''}`}>{value}</span>
    </div>
  )
}

function DiffBox({ label, value }) {
  if (value == null) return (
    <div className="bg-white rounded p-2 border border-amber-100">
      <div className="text-[10px] text-slate-600 uppercase tracking-wide font-semibold">{label}</div>
      <div className="text-slate-400 italic text-sm">No calculable</div>
    </div>
  )
  const positive = value > 0
  return (
    <div className="bg-white rounded p-2 border border-amber-100">
      <div className="text-[10px] text-slate-600 uppercase tracking-wide font-semibold">{label}</div>
      <div className={`font-bold text-sm ${positive ? 'text-rose-700' : 'text-emerald-700'}`}>
        {positive ? '+ ' : '− '}{fmtCOP(Math.abs(value))}
      </div>
    </div>
  )
}

/* UI Primitives */
function Section({ title, icon: Icon, children, highlight = false }) {
  return (
    <div className={`bg-white rounded-2xl shadow-sm border mb-6 p-6 print:shadow-none print:border print:rounded-none print:break-inside-avoid ${
      highlight ? 'border-blue-300 ring-1 ring-blue-100' : 'border-slate-300'
    }`}>
      <div className="flex items-center gap-3 mb-4 pb-3 border-b border-slate-200">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
          highlight ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
        }`}>
          <Icon className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-bold text-slate-900">{title}</h2>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">{children}</div>
    </div>
  )
}

function KV({ label, value, full = false }) {
  const display = (value === null || value === undefined || value === '')
    ? <span className="text-slate-400 italic">No registrado</span>
    : value === 'No aplica'
      ? <span className="text-slate-600 italic">No aplica</span>
      : <span className="text-slate-900 whitespace-pre-line">{value}</span>
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="text-xs font-semibold text-slate-700 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-sm">{display}</div>
    </div>
  )
}

function Badge({ color = 'slate', children }) {
  const colors = {
    emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    rose:    'bg-rose-100 text-rose-800 border-rose-300',
    blue:    'bg-blue-100 text-blue-800 border-blue-300',
    slate:   'bg-slate-100 text-slate-700 border-slate-300',
  }
  return (
    <span className={`inline-flex items-center px-3 py-1.5 rounded-lg text-sm font-semibold border ${colors[color]}`}>
      {children}
    </span>
  )
}

function formatVal(v) {
  if (v === null || v === undefined) return '∅'
  if (typeof v === 'object') return JSON.stringify(v).slice(0, 50)
  const s = String(v)
  return s.length > 80 ? s.slice(0, 80) + '…' : s
}
