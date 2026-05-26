import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import {
  ChevronLeft, ChevronRight, Save, Send, Check,
  Building2, User, Stethoscope, HeartPulse, FlaskConical,
  Pill, BookOpen, MessageSquareQuote, DollarSign, Paperclip, FileCheck2,
} from 'lucide-react'

const STEPS = [
  { id: 'admin',       label: 'Administrativo',  icon: Building2 },
  { id: 'demograf',    label: 'Demográficos',    icon: User },
  { id: 'diagnostico', label: 'Diagnóstico',     icon: Stethoscope },
  { id: 'antec',       label: 'Antecedentes',    icon: HeartPulse },
  { id: 'estudios',    label: 'Estudios',        icon: FlaskConical },
  { id: 'tratamientos',label: 'Tratamientos',    icon: Pill },
  { id: 'evidencia',   label: 'Evidencia',       icon: BookOpen },
  { id: 'pregunta',    label: 'Pregunta',        icon: MessageSquareQuote },
  { id: 'costos',      label: 'Costos',          icon: DollarSign },
  { id: 'adjuntos',    label: 'Adjuntos',        icon: Paperclip },
]

const DRAFT_KEY = 'sgico_presentacion_draft'
const NA = '__NA__'

const toIntOrNull = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = parseInt(v, 10)
  return isNaN(n) ? null : n
}

const toFloatOrNull = (v) => {
  if (v === '' || v === null || v === undefined || v === NA) return null
  const n = parseFloat(v)
  return isNaN(n) ? null : n
}

const initialState = {
  // 1. Administrativo
  sede_id: '', eps_id: '', medico_id: '', gestor_id: '',
  fecha_solicitud: new Date().toISOString().slice(0, 10),
  prioridad: 'normal',
  tipo_comite: 'tumor_solido',

  // 2. Demográficos
  documento: '', tipo_documento: 'CC', nombre: '', fecha_nacimiento: '',
  genero: '', telefono1: '',

  // 3. Diagnóstico
  cie10: '', diagnostico_descripcion: '', histologia: '',
  estadio_clinico: '', tnm_t: '', tnm_n: '', tnm_m: '',
  fecha_diagnostico: '', biomarcadores: '',

  // 4. Antecedentes
  ecog: '', comorbilidades: '', alergias: '',
  habito_tabaquico: '', habito_alcohol: '',
  medicacion_actual: '',

  // 5. Estudios
  estudios_imagenes: '', estudios_laboratorio: '',
  estudios_patologia: '', estudios_moleculares: '',
  fecha_ultimo_estudio: '',

  // 6. Tratamientos
  linea_actual: '',
  tratamiento_actual: '',                  // ← antes: molecula_previa
  quimioterapia_lineas_previas: '',        // ← campo único combinado
  tratamiento_quirurgico: '',
  tratamiento_rt: '',
  tratamiento_dirigido: '',
  respuesta_previa: '',

  // 7. Evidencia (PFS/OS del propuesto del estudio pivotal)
  protocolo_id: '', evidencia_referencia: '',
  evidencia_tipo: '', evidencia_link: '',
  pfs_esperado_estudio: '', os_esperado_estudio: '',

  // 8. Pregunta
  pregunta_comite: '', tratamiento_propuesto: '',
  justificacion_clinica: '',
  linea_propuesta: '',

  // 9. Costos por ciclo + PFS/OS del actual
  costo_ciclo_actual: '', dias_ciclo_actual: '21',
  pfs_actual_meses: '', os_actual_meses: '',
  costo_ciclo_propuesto: '', dias_ciclo_propuesto: '21',
  tiene_invima: '',
  en_unirse: '',

  // 10. Adjuntos
  adjuntos: [],
}

export default function PresentacionComite() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [data, setData] = useState(initialState)
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const [sedes, setSedes] = useState([])
  const [eps, setEps] = useState([])
  const [medicos, setMedicos] = useState([])
  const [gestores, setGestores] = useState([])
  const [protocolos, setProtocolos] = useState([])

  useEffect(() => {
    cargarCatalogos()
    const draft = localStorage.getItem(DRAFT_KEY)
    if (draft) {
      try {
        const parsed = JSON.parse(draft)
        setData(prev => ({ ...prev, ...parsed.data }))
        setStep(parsed.step || 0)
        toast.success('Borrador recuperado', { icon: '📝' })
      } catch { /* ignore */ }
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, step }))
    }, 800)
    return () => clearTimeout(t)
  }, [data, step])

  async function cargarCatalogos() {
    const [s, e, m, g, p] = await Promise.all([
      supabase.from('sedes').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('eps').select('id, nombre').eq('activa', true).order('nombre'),
      supabase.from('medicos').select('id, nombre, especialidad').eq('activo', true).order('nombre'),
      supabase.from('gestores').select('id, nombre').eq('activo', true).order('nombre'),
      supabase.from('protocolos')
        .select('id, nombre, estudio_pivotal, pfs_esperado_meses, os_esperado_meses')
        .eq('activo', true).order('nombre'),
    ])
    setSedes(s.data || [])
    setEps(e.data || [])
    setMedicos(m.data || [])
    setGestores(g.data || [])
    setProtocolos(p.data || [])
  }

  const update = (field, value) => {
    setData(prev => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: undefined }))
  }

  const toggleNA = (field) => {
    update(field, data[field] === NA ? '' : NA)
  }

  /* ── Cálculo de proyección — solo PFS ── */
  const proyeccion = useMemo(() => {
    return calcularProyeccion(data)
  }, [
    data.costo_ciclo_actual, data.dias_ciclo_actual,
    data.costo_ciclo_propuesto, data.dias_ciclo_propuesto,
    data.pfs_actual_meses, data.os_actual_meses,
    data.pfs_esperado_estudio, data.os_esperado_estudio,
  ])

  const validateStep = (idx) => {
    const errs = {}
    const today = new Date().toISOString().split('T')[0]
    const req = (f) => {
      const v = data[f]
      if (v === '' || v === null || v === undefined) errs[f] = 'Requerido'
    }
    const noFuture = (f) => {
      const v = data[f]
      if (v && v !== NA && v > today) errs[f] = 'No puede ser futura'
    }

    switch (idx) {
      case 0:
        req('sede_id'); req('eps_id'); req('medico_id'); req('fecha_solicitud')
        req('tipo_comite')
        noFuture('fecha_solicitud')
        break
      case 1:
        req('documento'); req('tipo_documento'); req('nombre')
        req('fecha_nacimiento'); req('genero')
        noFuture('fecha_nacimiento')
        break
      case 2:
        ;['cie10','diagnostico_descripcion','histologia','estadio_clinico',
          'tnm_t','tnm_n','tnm_m','fecha_diagnostico','biomarcadores']
          .forEach(f => req(f))
        noFuture('fecha_diagnostico')
        break
      case 3:
        ;['ecog','comorbilidades','alergias','habito_tabaquico',
          'habito_alcohol','medicacion_actual'].forEach(f => req(f))
        break
      case 4:
        ;['estudios_imagenes','estudios_laboratorio','estudios_patologia',
          'estudios_moleculares','fecha_ultimo_estudio'].forEach(f => req(f))
        noFuture('fecha_ultimo_estudio')
        break
      case 5:
        // Línea actual y tratamiento actual son requeridos
        req('linea_actual'); req('tratamiento_actual')
        // El resto se permiten "No aplica"
        ;['quimioterapia_lineas_previas','tratamiento_quirurgico',
          'tratamiento_rt','tratamiento_dirigido','respuesta_previa']
          .forEach(f => req(f))
        break
      case 6:
        req('protocolo_id'); req('evidencia_referencia')
        req('pfs_esperado_estudio'); req('os_esperado_estudio')
        break
      case 7:
        req('pregunta_comite'); req('tratamiento_propuesto')
        req('justificacion_clinica')
        break
      case 8:
        req('costo_ciclo_actual'); req('dias_ciclo_actual')
        req('pfs_actual_meses'); req('os_actual_meses')
        req('costo_ciclo_propuesto'); req('dias_ciclo_propuesto')
        break
      case 9:
        break
    }
    setErrors(errs)
    return errs
  }

  const stepIsValid = (errs) => Object.keys(errs).length === 0
  const hasFutureDateError = (errs) =>
    Object.values(errs).some(v => v === 'No puede ser futura')

  const next = () => {
    const errs = validateStep(step)
    if (!stepIsValid(errs)) {
      toast.error(hasFutureDateError(errs)
        ? 'La fecha no puede ser futura'
        : 'Completa los campos requeridos')
      return
    }
    setStep(s => Math.min(s + 1, STEPS.length - 1))
  }
  const back = () => setStep(s => Math.max(s - 1, 0))
  const goTo = (idx) => {
    if (idx > step) {
      const errs = validateStep(step)
      if (!stepIsValid(errs)) {
        toast.error(hasFutureDateError(errs)
          ? 'La fecha no puede ser futura'
          : 'Completa el paso actual primero')
        return
      }
    }
    setStep(idx)
  }

  const guardarBorrador = () => {
    setSaving(true)
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ data, step }))
    setTimeout(() => {
      setSaving(false)
      toast.success('Borrador guardado')
    }, 400)
  }

  const presentar = async () => {
    for (let i = 0; i < STEPS.length; i++) {
      const errs = validateStep(i)
      if (!stepIsValid(errs)) {
        setStep(i)
        toast.error(hasFutureDateError(errs)
          ? 'La fecha no puede ser futura'
          : `Faltan datos en: ${STEPS[i].label}`)
        return
      }
    }

    setSubmitting(true)
    try {
      const { data: pacExistente } = await supabase
        .from('pacientes')
        .select('id')
        .eq('documento', data.documento)
        .maybeSingle()

      let pacienteId = pacExistente?.id
      if (!pacienteId) {
        const { data: nuevoPac, error: pacErr } = await supabase
          .from('pacientes')
          .insert({
            documento: data.documento,
            tipo_documento: data.tipo_documento,
            nombre: data.nombre,
            fecha_nacimiento: data.fecha_nacimiento,
            genero: data.genero,
            telefono1: clean(data.telefono1),
            eps_id: toIntOrNull(data.eps_id),
            sede_id: toIntOrNull(data.sede_id),
          })
          .select('id').single()
        if (pacErr) throw pacErr
        pacienteId = nuevoPac.id
      }

      const preguntaTexto = data.pregunta_comite
      const tratamientoTexto = data.tratamiento_propuesto
      const justificacionTexto = data.justificacion_clinica

      const payload = {
        paciente_id: pacienteId,
        sede_id: toIntOrNull(data.sede_id),
        medico_id: toIntOrNull(data.medico_id),
        gestor_id: toIntOrNull(data.gestor_id),
        protocolo_id: toIntOrNull(data.protocolo_id),

        fecha_solicitud: data.fecha_solicitud,
        tipo_comite: data.tipo_comite,
        prioridad: data.prioridad,
        decision: 'pendiente',

        // Compatibilidad campos viejos
        motivo: preguntaTexto,
        justificacion: justificacionTexto,
        molecula_propuesta: tratamientoTexto?.slice(0, 100) || null,
        molecula_previa: clean(data.tratamiento_actual)?.slice(0, 100) || null,
        linea_actual: toIntOrNull(data.linea_actual),
        linea_propuesta: toIntOrNull(data.linea_propuesta),
        // tratamiento_previo unifica todas las modalidades en texto
        tratamiento_previo: [
          data.quimioterapia_lineas_previas,
          data.tratamiento_quirurgico,
          data.tratamiento_rt,
          data.tratamiento_dirigido,
        ].filter(x => x && x !== NA).join(' | ') || null,

        // Costos planos
        costo_previo:    toFloatOrNull(data.costo_ciclo_actual),
        costo_estimado:  toFloatOrNull(data.costo_ciclo_propuesto),
        proyeccion_costos: proyeccion,

        // Regulatorio
        tiene_invima: data.tiene_invima === 'si' ? true : data.tiene_invima === 'no' ? false : null,
        en_unirse:    data.en_unirse === 'si' ? true : data.en_unirse === 'no' ? false : null,

        // Clínicos detallados
        diagnostico_descripcion: clean(data.diagnostico_descripcion),
        histologia: clean(data.histologia),
        estadio_clinico: clean(data.estadio_clinico),
        tnm: armarTNM(data),
        fecha_diagnostico: cleanDate(data.fecha_diagnostico),
        biomarcadores: clean(data.biomarcadores),

        ecog: clean(data.ecog),
        comorbilidades: clean(data.comorbilidades),
        alergias: clean(data.alergias),
        habito_tabaquico: clean(data.habito_tabaquico),
        habito_alcohol: clean(data.habito_alcohol),
        medicacion_actual: clean(data.medicacion_actual),

        estudios_imagenes: clean(data.estudios_imagenes),
        estudios_laboratorio: clean(data.estudios_laboratorio),
        estudios_patologia: clean(data.estudios_patologia),
        estudios_moleculares: clean(data.estudios_moleculares),
        fecha_ultimo_estudio: cleanDate(data.fecha_ultimo_estudio),

        tratamiento_quirurgico: clean(data.tratamiento_quirurgico),
        // El nuevo campo combinado se mapea a tratamiento_qt para preservar BD
        tratamiento_qt: clean(data.quimioterapia_lineas_previas),
        tratamiento_rt: clean(data.tratamiento_rt),
        tratamiento_dirigido: clean(data.tratamiento_dirigido),
        respuesta_previa: clean(data.respuesta_previa),

        evidencia_referencia: clean(data.evidencia_referencia),
        evidencia_tipo: clean(data.evidencia_tipo),
        evidencia_link: clean(data.evidencia_link),
        pfs_esperado_estudio: toFloatOrNull(data.pfs_esperado_estudio),
        os_esperado_estudio:  toFloatOrNull(data.os_esperado_estudio),

        pregunta_comite: preguntaTexto,
        tratamiento_propuesto: tratamientoTexto,
        justificacion_clinica: justificacionTexto,

        adjuntos: data.adjuntos,
      }

      const { data: caso, error: casoErr } = await supabase
        .from('casos_comite')
        .insert(payload)
        .select('id').single()
      if (casoErr) throw casoErr

      localStorage.removeItem(DRAFT_KEY)
      toast.success('Caso presentado al comité', { icon: '🎉' })
      navigate(`/casos/${caso.id}`)
    } catch (e) {
      console.error('Error al presentar:', e)
      toast.error(`Error al presentar: ${e.message}`)
    } finally {
      setSubmitting(false)
    }
  }

  const progress = useMemo(() => Math.round((step / (STEPS.length - 1)) * 100), [step])

  return (
    <div className="max-w-5xl mx-auto p-4 lg:p-6">
      <div className="mb-6">
        <h1 className="text-2xl lg:text-3xl font-bold text-slate-900">
          Presentación al Comité de Tumores
        </h1>
        <p className="text-slate-600 text-sm mt-1">
          Complete la información clínica y administrativa para inscribir el caso
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-4 lg:p-6 mb-6">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-slate-700">
            Paso {step + 1} de {STEPS.length}
          </span>
          <span className="text-xs font-bold text-blue-700">{progress}% completado</span>
        </div>
        <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden mb-6">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
            style={{ width: `${progress}%` }} />
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-10 gap-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon
            const done = i < step
            const active = i === step
            return (
              <button key={s.id} onClick={() => goTo(i)}
                className={`flex flex-col items-center gap-1 p-2 rounded-lg text-xs transition-all ${
                  active ? 'bg-blue-50 text-blue-700 ring-2 ring-blue-500'
                    : done ? 'text-emerald-600 hover:bg-emerald-50'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                  active ? 'bg-blue-600 text-white' :
                  done ? 'bg-emerald-500 text-white' : 'bg-slate-200'
                }`}>
                  {done ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className="text-[10px] leading-tight text-center font-semibold">{s.label}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-300 p-4 lg:p-8 mb-6">
        {step === 0 && <StepAdmin {...{ data, update, errors, sedes, eps, medicos, gestores }} />}
        {step === 1 && <StepDemograficos {...{ data, update, errors }} />}
        {step === 2 && <StepDiagnostico {...{ data, update, errors, toggleNA }} />}
        {step === 3 && <StepAntecedentes {...{ data, update, errors, toggleNA }} />}
        {step === 4 && <StepEstudios {...{ data, update, errors, toggleNA }} />}
        {step === 5 && <StepTratamientos {...{ data, update, errors, toggleNA }} />}
        {step === 6 && <StepEvidencia {...{ data, update, errors, protocolos }} />}
        {step === 7 && <StepPregunta {...{ data, update, errors }} />}
        {step === 8 && <StepCostos {...{ data, update, errors, toggleNA, proyeccion }} />}
        {step === 9 && <StepAdjuntos {...{ data, update, errors }} />}
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
        <button onClick={back} disabled={step === 0}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-white border border-slate-400 text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed">
          <ChevronLeft className="w-4 h-4" /> Anterior
        </button>
        <div className="flex gap-2 w-full sm:w-auto">
          <button onClick={guardarBorrador} disabled={saving}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-slate-200 text-slate-800 hover:bg-slate-300">
            <Save className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar borrador'}
          </button>
          {step < STEPS.length - 1 ? (
            <button onClick={next}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              Siguiente <ChevronRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={presentar} disabled={submitting}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-gradient-to-r from-emerald-600 to-emerald-700 text-white hover:from-emerald-700 hover:to-emerald-800 disabled:opacity-50">
              <Send className="w-4 h-4" />
              {submitting ? 'Presentando...' : 'Presentar al comité'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* ──────────────────────────────────────────────────────────────
   Cálculo de proyección — SOLO PFS
   ────────────────────────────────────────────────────────────── */
function calcularProyeccion(d) {
  const ca = parseFloat(d.costo_ciclo_actual)
  const da = parseInt(d.dias_ciclo_actual, 10)
  const cp = parseFloat(d.costo_ciclo_propuesto)
  const dp = parseInt(d.dias_ciclo_propuesto, 10)
  const pfsP = parseFloat(d.pfs_esperado_estudio)
  const osP  = parseFloat(d.os_esperado_estudio)

  // PFS y OS actuales pueden ser "No aplica" (paciente naive)
  const pfsActualNA = d.pfs_actual_meses === NA
  const osActualNA  = d.os_actual_meses === NA
  const pfsA = pfsActualNA ? null : parseFloat(d.pfs_actual_meses)
  const osA  = osActualNA  ? null : parseFloat(d.os_actual_meses)

  // Inputs mínimos requeridos para calcular cualquier cosa
  if ([ca, da, cp, dp, pfsP].some(v => isNaN(v) || v <= 0)) return null

  const ciclosPfsP = (pfsP * 30) / dp
  const totalPfsP = ciclosPfsP * cp
  const ciclosOsP = !isNaN(osP) && osP > 0 ? (osP * 30) / dp : null
  const totalOsP  = ciclosOsP != null ? ciclosOsP * cp : null

  // Si el actual aplica, calcular comparativo
  let actual = { costo_ciclo: ca, duracion_dias: da, pfs_meses: null, os_meses: null }
  let diferencial = null

  if (pfsA != null && !isNaN(pfsA) && pfsA > 0) {
    const ciclosPfsA = (pfsA * 30) / da
    const totalPfsA = ciclosPfsA * ca
    const ciclosOsA = osA != null && !isNaN(osA) && osA > 0 ? (osA * 30) / da : null
    const totalOsA  = ciclosOsA != null ? ciclosOsA * ca : null

    actual = {
      ...actual,
      pfs_meses: pfsA,
      os_meses: osA,
      ciclos_pfs: redondear(ciclosPfsA, 2),
      ciclos_os:  ciclosOsA != null ? redondear(ciclosOsA, 2) : null,
      total_pfs: redondear(totalPfsA),
      total_os:  totalOsA != null ? redondear(totalOsA) : null,
    }

    const diffPfs = totalPfsP - totalPfsA
    const ganPfs = pfsP - pfsA
    diferencial = {
      diferencia_pfs: redondear(diffPfs),
      ganancia_pfs_meses: redondear(ganPfs, 2),
      costo_por_mes_pfs_ganado: ganPfs > 0 ? redondear(diffPfs / ganPfs) : null,
      es_naive: false,
    }
  } else {
    // Paciente naive: no hay actual con qué comparar
    diferencial = {
      diferencia_pfs: null,
      ganancia_pfs_meses: null,
      costo_por_mes_pfs_ganado: null,
      es_naive: true,
    }
  }

  return {
    actual,
    propuesto: {
      costo_ciclo: cp,
      duracion_dias: dp,
      pfs_meses: pfsP,
      os_meses: !isNaN(osP) && osP > 0 ? osP : null,
      ciclos_pfs: redondear(ciclosPfsP, 2),
      ciclos_os:  ciclosOsP != null ? redondear(ciclosOsP, 2) : null,
      total_pfs:  redondear(totalPfsP),
      total_os:   totalOsP != null ? redondear(totalOsP) : null,
    },
    diferencial,
    nota: 'Cálculo basado en PFS (Progression-Free Survival). El OS se muestra como referencia clínica únicamente.',
  }
}

const redondear = (n, dec = 0) => {
  const f = Math.pow(10, dec)
  return Math.round(n * f) / f
}

const fmtCOP = (n) => n == null ? '—' : '$ ' + Number(n).toLocaleString('es-CO') + ' COP'

const clean = (v) => (v === NA ? 'No aplica' : (v?.toString().trim() || null))
const cleanDate = (v) => (v === NA || !v ? null : v)
const armarTNM = (d) => {
  const t = d.tnm_t === NA ? null : d.tnm_t
  const n = d.tnm_n === NA ? null : d.tnm_n
  const m = d.tnm_m === NA ? null : d.tnm_m
  if (!t && !n && !m) return null
  return `${t || '-'}${n || '-'}${m || '-'}`
}

/* ──────────────────────────────────────────────────────────────
   UI primitives
   ────────────────────────────────────────────────────────────── */
function Section({ title, description, icon: Icon, children }) {
  return (
    <div>
      <div className="flex items-start gap-3 mb-6 pb-4 border-b border-slate-200">
        {Icon && (
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div>
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          {description && <p className="text-sm text-slate-600 mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </div>
  )
}

function Field({ label, required, error, naValue, onToggleNA, children, full, hint }) {
  return (
    <div className={full ? 'md:col-span-2' : ''}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-semibold text-slate-800">
          {label} {required && <span className="text-red-600">*</span>}
        </label>
        {onToggleNA && (
          <button type="button" onClick={onToggleNA}
            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors ${
              naValue ? 'bg-amber-200 text-amber-900 ring-1 ring-amber-400'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}>
            {naValue ? '✓ No aplica' : 'No aplica'}
          </button>
        )}
      </div>
      <div className={naValue ? 'opacity-40 pointer-events-none' : ''}>{children}</div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
      {error && <p className="text-xs text-red-600 mt-1 font-medium">{error}</p>}
    </div>
  )
}

const inputBase = 'w-full px-3 py-2 border-2 rounded-lg text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500'

function Input({ value, onChange, error, ...rest }) {
  return (
    <input value={value === NA ? '' : (value || '')}
      onChange={e => onChange(e.target.value)}
      className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
      {...rest} />
  )
}

function TextArea({ value, onChange, error, rows = 3, ...rest }) {
  return (
    <textarea value={value === NA ? '' : (value || '')}
      onChange={e => onChange(e.target.value)} rows={rows}
      className={`${inputBase} resize-none ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}
      {...rest} />
  )
}

function Select({ value, onChange, options, error, placeholder = 'Seleccione...' }) {
  return (
    <select value={value === NA ? '' : (value || '')}
      onChange={e => onChange(e.target.value)}
      className={`${inputBase} ${error ? 'border-red-400 bg-red-50' : 'border-slate-300 bg-white'}`}>
      <option value="">{placeholder}</option>
      {options.map(o => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  )
}

/* ──────────────────────────────────────────────────────────────
   STEPS
   ────────────────────────────────────────────────────────────── */
function StepAdmin({ data, update, errors, sedes, eps, medicos, gestores }) {
  return (
    <Section title="Datos administrativos" description="Información de ruta del paciente y solicitante" icon={Building2}>
      <Field label="Sede" required error={errors.sede_id}>
        <Select value={data.sede_id} onChange={v => update('sede_id', v)}
          options={sedes.map(s => ({ value: s.id, label: s.nombre }))} error={errors.sede_id} />
      </Field>
      <Field label="EPS" required error={errors.eps_id}>
        <Select value={data.eps_id} onChange={v => update('eps_id', v)}
          options={eps.map(e => ({ value: e.id, label: e.nombre }))} error={errors.eps_id} />
      </Field>
      <Field label="Médico solicitante" required error={errors.medico_id}>
        <Select value={data.medico_id} onChange={v => update('medico_id', v)}
          options={medicos.map(m => ({
            value: m.id,
            label: `${m.nombre}${m.especialidad ? ` — ${m.especialidad}` : ''}`,
          }))} error={errors.medico_id} />
      </Field>
      <Field label="Gestor de caso">
        <Select value={data.gestor_id} onChange={v => update('gestor_id', v)}
          options={gestores.map(g => ({ value: g.id, label: g.nombre }))} />
      </Field>
      <Field label="Tipo de comité" required error={errors.tipo_comite}>
        <Select value={data.tipo_comite} onChange={v => update('tipo_comite', v)}
          options={[
            { value: 'tumor_solido',       label: 'Tumor sólido' },
            { value: 'hematologico',       label: 'Hematológico' },
            { value: 'multidisciplinario', label: 'Multidisciplinario' },
          ]} error={errors.tipo_comite} />
      </Field>
      <Field label="Prioridad" required>
        <Select value={data.prioridad} onChange={v => update('prioridad', v)}
          options={[
            { value: 'normal',  label: 'Normal' },
            { value: 'urgente', label: 'Urgente' },
            { value: 'critica', label: 'Crítica' },
          ]} />
      </Field>
      <Field label="Fecha de solicitud" required error={errors.fecha_solicitud}>
        <Input type="date" value={data.fecha_solicitud}
          max={new Date().toISOString().split('T')[0]}
          onChange={v => update('fecha_solicitud', v)} error={errors.fecha_solicitud} />
      </Field>
    </Section>
  )
}

function StepDemograficos({ data, update, errors }) {
  return (
    <Section title="Datos del paciente" description="Identificación y datos de contacto" icon={User}>
      <Field label="Tipo de documento" required error={errors.tipo_documento}>
        <Select value={data.tipo_documento} onChange={v => update('tipo_documento', v)}
          options={[
            { value: 'CC', label: 'Cédula de Ciudadanía' },
            { value: 'TI', label: 'Tarjeta de Identidad' },
            { value: 'CE', label: 'Cédula de Extranjería' },
            { value: 'PA', label: 'Pasaporte' },
            { value: 'RC', label: 'Registro Civil' },
            { value: 'PT', label: 'Permiso de Tránsito' },
          ]} />
      </Field>
      <Field label="Número de documento" required error={errors.documento}>
        <Input value={data.documento} onChange={v => update('documento', v.replace(/\D/g, ''))}
          placeholder="Solo números" error={errors.documento} />
      </Field>
      <Field label="Nombre completo" required error={errors.nombre} full>
        <Input value={data.nombre} onChange={v => update('nombre', v.toUpperCase())}
          placeholder="APELLIDOS NOMBRES" error={errors.nombre} />
      </Field>
      <Field label="Fecha de nacimiento" required error={errors.fecha_nacimiento}>
        <Input type="date" value={data.fecha_nacimiento}
          max={new Date().toISOString().split('T')[0]}
          onChange={v => update('fecha_nacimiento', v)} error={errors.fecha_nacimiento} />
      </Field>
      <Field label="Género" required error={errors.genero}>
        <Select value={data.genero} onChange={v => update('genero', v)}
          options={[
            { value: 'M', label: 'Masculino' },
            { value: 'F', label: 'Femenino' },
            { value: 'I', label: 'Indeterminado' },
          ]} error={errors.genero} />
      </Field>
      <Field label="Teléfono">
        <Input value={data.telefono1} onChange={v => update('telefono1', v)} placeholder="3001234567" />
      </Field>
    </Section>
  )
}

function StepDiagnostico({ data, update, errors, toggleNA }) {
  return (
    <Section title="Diagnóstico oncológico" description="Codificación CIE-10, histología y estadificación TNM" icon={Stethoscope}>
      <Field label="Código CIE-10" required error={errors.cie10}
        naValue={data.cie10 === NA} onToggleNA={() => toggleNA('cie10')}>
        <Input value={data.cie10} onChange={v => update('cie10', v.toUpperCase())}
          placeholder="Ej. C50.9" error={errors.cie10} />
      </Field>
      <Field label="Fecha del diagnóstico" required error={errors.fecha_diagnostico}
        naValue={data.fecha_diagnostico === NA} onToggleNA={() => toggleNA('fecha_diagnostico')}>
        <Input type="date" value={data.fecha_diagnostico}
          max={new Date().toISOString().split('T')[0]}
          onChange={v => update('fecha_diagnostico', v)} error={errors.fecha_diagnostico} />
      </Field>
      <Field label="Descripción del diagnóstico" required full
        error={errors.diagnostico_descripcion}
        naValue={data.diagnostico_descripcion === NA}
        onToggleNA={() => toggleNA('diagnostico_descripcion')}>
        <TextArea value={data.diagnostico_descripcion}
          onChange={v => update('diagnostico_descripcion', v)}
          placeholder="Ej. Adenocarcinoma de mama derecha, RH+/HER2-, estadio IV con metástasis hepáticas"
          error={errors.diagnostico_descripcion} />
      </Field>
      <Field label="Histología" required full error={errors.histologia}
        naValue={data.histologia === NA} onToggleNA={() => toggleNA('histologia')}>
        <Input value={data.histologia} onChange={v => update('histologia', v)}
          placeholder="Ej. Carcinoma ductal infiltrante, grado II" error={errors.histologia} />
      </Field>
      <Field label="Estadio clínico" required error={errors.estadio_clinico}
        naValue={data.estadio_clinico === NA} onToggleNA={() => toggleNA('estadio_clinico')}>
        <Select value={data.estadio_clinico} onChange={v => update('estadio_clinico', v)}
          options={[
            { value: '0', label: 'Estadio 0' },
            { value: 'I', label: 'Estadio I' }, { value: 'IA', label: 'Estadio IA' }, { value: 'IB', label: 'Estadio IB' },
            { value: 'II', label: 'Estadio II' }, { value: 'IIA', label: 'Estadio IIA' }, { value: 'IIB', label: 'Estadio IIB' },
            { value: 'III', label: 'Estadio III' }, { value: 'IIIA', label: 'Estadio IIIA' },
            { value: 'IIIB', label: 'Estadio IIIB' }, { value: 'IIIC', label: 'Estadio IIIC' },
            { value: 'IV', label: 'Estadio IV' },
          ]} error={errors.estadio_clinico} />
      </Field>
      <div />
      <Field label="T (Tumor)" required error={errors.tnm_t}
        naValue={data.tnm_t === NA} onToggleNA={() => toggleNA('tnm_t')}>
        <Input value={data.tnm_t} onChange={v => update('tnm_t', v.toUpperCase())}
          placeholder="Tx, T0, T1..." error={errors.tnm_t} />
      </Field>
      <Field label="N (Nodos)" required error={errors.tnm_n}
        naValue={data.tnm_n === NA} onToggleNA={() => toggleNA('tnm_n')}>
        <Input value={data.tnm_n} onChange={v => update('tnm_n', v.toUpperCase())}
          placeholder="Nx, N0, N1..." error={errors.tnm_n} />
      </Field>
      <Field label="M (Metástasis)" required error={errors.tnm_m}
        naValue={data.tnm_m === NA} onToggleNA={() => toggleNA('tnm_m')}>
        <Input value={data.tnm_m} onChange={v => update('tnm_m', v.toUpperCase())}
          placeholder="Mx, M0, M1" error={errors.tnm_m} />
      </Field>
      <Field label="Biomarcadores y mutaciones" required full error={errors.biomarcadores}
        naValue={data.biomarcadores === NA} onToggleNA={() => toggleNA('biomarcadores')}>
        <TextArea value={data.biomarcadores} onChange={v => update('biomarcadores', v)}
          placeholder="Ej. RE 90%, RP 70%, HER2 negativo, Ki67 30%, PD-L1 TPS 50%"
          error={errors.biomarcadores} />
      </Field>
    </Section>
  )
}

function StepAntecedentes({ data, update, errors, toggleNA }) {
  return (
    <Section title="Antecedentes y comorbilidades" description="Estado funcional, enfermedades concomitantes y hábitos" icon={HeartPulse}>
      <Field label="ECOG Performance Status" required error={errors.ecog}
        naValue={data.ecog === NA} onToggleNA={() => toggleNA('ecog')}>
        <Select value={data.ecog} onChange={v => update('ecog', v)}
          options={[
            { value: '0', label: '0 — Asintomático, totalmente activo' },
            { value: '1', label: '1 — Síntomas leves, ambulatorio' },
            { value: '2', label: '2 — Encamado <50% del día' },
            { value: '3', label: '3 — Encamado >50% del día' },
            { value: '4', label: '4 — Postrado, no se autocuida' },
          ]} error={errors.ecog} />
      </Field>
      <div />
      <Field label="Comorbilidades" required full error={errors.comorbilidades}
        naValue={data.comorbilidades === NA} onToggleNA={() => toggleNA('comorbilidades')}>
        <TextArea value={data.comorbilidades} onChange={v => update('comorbilidades', v)}
          placeholder="Ej. HTA, DM2 controlada, hipotiroidismo en sustitución" error={errors.comorbilidades} />
      </Field>
      <Field label="Alergias" required full error={errors.alergias}
        naValue={data.alergias === NA} onToggleNA={() => toggleNA('alergias')}>
        <TextArea value={data.alergias} onChange={v => update('alergias', v)}
          placeholder="Ej. Penicilina (rash), AINES (broncoespasmo)" rows={2} error={errors.alergias} />
      </Field>
      <Field label="Hábito tabáquico" required error={errors.habito_tabaquico}
        naValue={data.habito_tabaquico === NA} onToggleNA={() => toggleNA('habito_tabaquico')}>
        <Select value={data.habito_tabaquico} onChange={v => update('habito_tabaquico', v)}
          options={[
            { value: 'nunca',     label: 'Nunca fumó' },
            { value: 'exfumador', label: 'Exfumador' },
            { value: 'activo',    label: 'Fumador activo' },
          ]} error={errors.habito_tabaquico} />
      </Field>
      <Field label="Hábito alcohólico" required error={errors.habito_alcohol}
        naValue={data.habito_alcohol === NA} onToggleNA={() => toggleNA('habito_alcohol')}>
        <Select value={data.habito_alcohol} onChange={v => update('habito_alcohol', v)}
          options={[
            { value: 'nunca',     label: 'No consume' },
            { value: 'social',    label: 'Social ocasional' },
            { value: 'frecuente', label: 'Frecuente' },
            { value: 'abuso',     label: 'Abuso/dependencia' },
          ]} error={errors.habito_alcohol} />
      </Field>
      <Field label="Medicación actual" required full error={errors.medicacion_actual}
        naValue={data.medicacion_actual === NA} onToggleNA={() => toggleNA('medicacion_actual')}>
        <TextArea value={data.medicacion_actual} onChange={v => update('medicacion_actual', v)}
          placeholder="Ej. Losartán 50 mg/día, metformina 850 mg c/12h" error={errors.medicacion_actual} />
      </Field>
    </Section>
  )
}

function StepEstudios({ data, update, errors, toggleNA }) {
  return (
    <Section title="Estudios e imágenes realizadas" description="Hallazgos relevantes con fechas y resultados" icon={FlaskConical}>
      <Field label="Imágenes diagnósticas" required full error={errors.estudios_imagenes}
        naValue={data.estudios_imagenes === NA} onToggleNA={() => toggleNA('estudios_imagenes')}>
        <TextArea value={data.estudios_imagenes} onChange={v => update('estudios_imagenes', v)}
          placeholder="Ej. TAC tórax-abdomen-pelvis 02/03/2026: lesión pulmonar LSI 22mm. PET-CT 15/03/2026: SUV 12."
          error={errors.estudios_imagenes} />
      </Field>
      <Field label="Laboratorio relevante" required full error={errors.estudios_laboratorio}
        naValue={data.estudios_laboratorio === NA} onToggleNA={() => toggleNA('estudios_laboratorio')}>
        <TextArea value={data.estudios_laboratorio} onChange={v => update('estudios_laboratorio', v)}
          placeholder="Ej. Hb 12.4, Leu 6800, Plaq 220k, Cr 0.9, BT 0.7..."
          error={errors.estudios_laboratorio} />
      </Field>
      <Field label="Patología" required full error={errors.estudios_patologia}
        naValue={data.estudios_patologia === NA} onToggleNA={() => toggleNA('estudios_patologia')}>
        <TextArea value={data.estudios_patologia} onChange={v => update('estudios_patologia', v)}
          placeholder="Ej. Biopsia 28/02/2026: adenocarcinoma pulmonar. IHQ: TTF-1+, Napsina A+"
          error={errors.estudios_patologia} />
      </Field>
      <Field label="Estudios moleculares / NGS" required full error={errors.estudios_moleculares}
        naValue={data.estudios_moleculares === NA} onToggleNA={() => toggleNA('estudios_moleculares')}>
        <TextArea value={data.estudios_moleculares} onChange={v => update('estudios_moleculares', v)}
          placeholder="Ej. EGFR exón 19 deletion positivo, ALK negativo, ROS1 negativo, PD-L1 TPS 5%"
          error={errors.estudios_moleculares} />
      </Field>
      <Field label="Fecha del último estudio" required error={errors.fecha_ultimo_estudio}
        naValue={data.fecha_ultimo_estudio === NA} onToggleNA={() => toggleNA('fecha_ultimo_estudio')}>
        <Input type="date" value={data.fecha_ultimo_estudio}
          max={new Date().toISOString().split('T')[0]}
          onChange={v => update('fecha_ultimo_estudio', v)} error={errors.fecha_ultimo_estudio} />
      </Field>
    </Section>
  )
}

/* ──────────────────────────────────────────────────────────────
   STEP 6 — Tratamientos (REESTRUCTURADO)
   ────────────────────────────────────────────────────────────── */
function StepTratamientos({ data, update, errors, toggleNA }) {
  return (
    <Section title="Tratamientos previos y actual" description="Línea actual del paciente, tratamientos previos y modalidades" icon={Pill}>
      {/* TRATAMIENTO ACTUAL */}
      <div className="md:col-span-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 mt-2">
          📍 Situación actual del paciente
        </h3>
      </div>
      <Field label="Línea actual de tratamiento" required error={errors.linea_actual}
        hint="Número de la línea actual. 0 = paciente naive (no ha recibido tratamiento previo).">
        <Input type="number" min="0" max="10" value={data.linea_actual}
          onChange={v => update('linea_actual', v)} placeholder="Ej. 1, 2, 3..."
          error={errors.linea_actual} />
      </Field>
      <Field label="Tratamiento actual" required error={errors.tratamiento_actual}
        hint="Lo que el paciente está recibiendo en este momento.">
        <Input value={data.tratamiento_actual} onChange={v => update('tratamiento_actual', v)}
          placeholder="Ej. Carboplatino + Pemetrexed" error={errors.tratamiento_actual} />
      </Field>

      {/* QUIMIOTERAPIA Y LÍNEAS PREVIAS — campo único */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          📜 Tratamientos previos
        </h3>
      </div>
      <Field label="Quimioterapia y líneas previas" required full
        error={errors.quimioterapia_lineas_previas}
        naValue={data.quimioterapia_lineas_previas === NA}
        onToggleNA={() => toggleNA('quimioterapia_lineas_previas')}
        hint="Liste las líneas previas con sus tratamientos en orden cronológico.">
        <TextArea value={data.quimioterapia_lineas_previas}
          onChange={v => update('quimioterapia_lineas_previas', v)}
          rows={4}
          placeholder={`Ej.
Línea 1: Cisplatino + Etopósido x4 ciclos (2023)
Línea 2: Atezolizumab (2024-2025)
Línea 3: AC x4 ciclos + Paclitaxel x12 semanales (jul 2025-feb 2026)`}
          error={errors.quimioterapia_lineas_previas} />
      </Field>

      {/* OTRAS MODALIDADES */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          🔬 Otras modalidades terapéuticas
        </h3>
      </div>
      <Field label="Tratamiento quirúrgico" required full error={errors.tratamiento_quirurgico}
        naValue={data.tratamiento_quirurgico === NA} onToggleNA={() => toggleNA('tratamiento_quirurgico')}>
        <TextArea value={data.tratamiento_quirurgico} onChange={v => update('tratamiento_quirurgico', v)}
          placeholder="Ej. Mastectomía radical modificada derecha + vaciamiento axilar (15/06/2025)"
          error={errors.tratamiento_quirurgico} />
      </Field>
      <Field label="Radioterapia" required full error={errors.tratamiento_rt}
        naValue={data.tratamiento_rt === NA} onToggleNA={() => toggleNA('tratamiento_rt')}>
        <TextArea value={data.tratamiento_rt} onChange={v => update('tratamiento_rt', v)}
          placeholder="Ej. RT externa pared torácica 50 Gy en 25 fracciones"
          error={errors.tratamiento_rt} />
      </Field>
      <Field label="Terapias dirigidas / inmunoterapia / hormonoterapia"
        required full error={errors.tratamiento_dirigido}
        naValue={data.tratamiento_dirigido === NA} onToggleNA={() => toggleNA('tratamiento_dirigido')}>
        <TextArea value={data.tratamiento_dirigido} onChange={v => update('tratamiento_dirigido', v)}
          placeholder="Ej. Tamoxifeno 20 mg/día desde abril 2026 (en curso)"
          error={errors.tratamiento_dirigido} />
      </Field>
      <Field label="Respuesta al tratamiento previo" required full error={errors.respuesta_previa}
        naValue={data.respuesta_previa === NA} onToggleNA={() => toggleNA('respuesta_previa')}>
        <TextArea value={data.respuesta_previa} onChange={v => update('respuesta_previa', v)}
          placeholder="Ej. Respuesta parcial inicial. Progresión hepática documentada en TAC del 20/04/2026 (RECIST 1.1)"
          error={errors.respuesta_previa} />
      </Field>
    </Section>
  )
}

function StepEvidencia({ data, update, errors, protocolos }) {
  const onProtocoloChange = (id) => {
    update('protocolo_id', id)
    const p = protocolos.find(x => String(x.id) === String(id))
    if (p) {
      if (p.estudio_pivotal) update('evidencia_referencia', p.estudio_pivotal)
      if (p.pfs_esperado_meses != null) update('pfs_esperado_estudio', p.pfs_esperado_meses)
      if (p.os_esperado_meses != null)  update('os_esperado_estudio', p.os_esperado_meses)
    }
  }

  return (
    <Section title="Estudio que avala la solicitud" description="Evidencia pivotal del tratamiento PROPUESTO" icon={BookOpen}>
      <Field label="Protocolo / régimen propuesto" required full error={errors.protocolo_id}
        hint="Al seleccionar un protocolo se autocompletan PFS y OS esperados.">
        <Select value={data.protocolo_id} onChange={onProtocoloChange}
          options={protocolos.map(p => ({
            value: p.id,
            label: `${p.nombre}${p.estudio_pivotal ? ` — ${p.estudio_pivotal}` : ''}`,
          }))} placeholder="Seleccione un protocolo del catálogo..." error={errors.protocolo_id} />
      </Field>
      <Field label="Estudio o referencia bibliográfica" required full error={errors.evidencia_referencia}>
        <Input value={data.evidencia_referencia} onChange={v => update('evidencia_referencia', v)}
          placeholder="Ej. KEYNOTE-189, FLAURA, CLEOPATRA" error={errors.evidencia_referencia} />
      </Field>
      <Field label="Tipo de evidencia">
        <Select value={data.evidencia_tipo} onChange={v => update('evidencia_tipo', v)}
          options={[
            { value: 'fase_3',     label: 'Ensayo fase III' },
            { value: 'fase_2',     label: 'Ensayo fase II' },
            { value: 'metanalisis',label: 'Metaanálisis' },
            { value: 'guia',       label: 'Guía de práctica clínica' },
            { value: 'consenso',   label: 'Consenso de expertos' },
            { value: 'real_world', label: 'Evidencia del mundo real' },
          ]} />
      </Field>
      <Field label="Enlace al estudio (DOI / PubMed)">
        <Input value={data.evidencia_link} onChange={v => update('evidencia_link', v)}
          placeholder="https://doi.org/..." />
      </Field>
      <Field label="PFS esperado del PROPUESTO (meses)" required error={errors.pfs_esperado_estudio}
        hint="Progression-Free Survival reportado en el estudio pivotal.">
        <Input type="number" step="0.1" min="0" value={data.pfs_esperado_estudio}
          onChange={v => update('pfs_esperado_estudio', v)} placeholder="Ej. 8.8"
          error={errors.pfs_esperado_estudio} />
      </Field>
      <Field label="OS esperado del PROPUESTO (meses)" required error={errors.os_esperado_estudio}
        hint="Overall Survival reportado en el estudio pivotal (referencia clínica).">
        <Input type="number" step="0.1" min="0" value={data.os_esperado_estudio}
          onChange={v => update('os_esperado_estudio', v)} placeholder="Ej. 22.0"
          error={errors.os_esperado_estudio} />
      </Field>
    </Section>
  )
}

function StepPregunta({ data, update, errors }) {
  return (
    <Section title="Pregunta al comité" description="Motivo concreto de presentación y propuesta clínica" icon={MessageSquareQuote}>
      <Field label="¿Cuál es la pregunta específica para el comité?"
        required full error={errors.pregunta_comite}>
        <TextArea value={data.pregunta_comite} onChange={v => update('pregunta_comite', v)}
          rows={4}
          placeholder="Ej. ¿Está justificado iniciar segunda línea con osimertinib o se debe rebiopsiar para identificar T790M antes?"
          error={errors.pregunta_comite} />
      </Field>
      <Field label="Línea propuesta">
        <Input type="number" min="1" max="10" value={data.linea_propuesta}
          onChange={v => update('linea_propuesta', v)} placeholder="Ej. 2" />
      </Field>
      <div />
      <Field label="Tratamiento propuesto" required full error={errors.tratamiento_propuesto}>
        <TextArea value={data.tratamiento_propuesto} onChange={v => update('tratamiento_propuesto', v)}
          rows={3}
          placeholder="Ej. Osimertinib 80 mg/día VO continuo hasta progresión o toxicidad inaceptable"
          error={errors.tratamiento_propuesto} />
      </Field>
      <Field label="Justificación clínica" required full error={errors.justificacion_clinica}>
        <TextArea value={data.justificacion_clinica} onChange={v => update('justificacion_clinica', v)}
          rows={4}
          placeholder="Argumente por qué este paciente se beneficiaría del tratamiento propuesto..."
          error={errors.justificacion_clinica} />
      </Field>
    </Section>
  )
}

/* ──────────────────────────────────────────────────────────────
   STEP 9 — Costos por ciclo + Proyección PFS (cálculo)
              + OS atenuado como referencia
   ────────────────────────────────────────────────────────────── */
function StepCostos({ data, update, errors, toggleNA, proyeccion }) {
  const pfsActualNA = data.pfs_actual_meses === NA
  const osActualNA  = data.os_actual_meses === NA

  return (
    <Section
      title="Costos del tratamiento por ciclo"
      description="Cálculo basado en PFS — el OS se muestra solo como referencia clínica"
      icon={DollarSign}
    >
      {/* TRATAMIENTO ACTUAL */}
      <div className="md:col-span-2">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3 mt-2">
          🩺 Tratamiento actual del paciente
        </h3>
      </div>
      <Field label="Costo por ciclo (COP)" required error={errors.costo_ciclo_actual}>
        <Input type="number" min="0" value={data.costo_ciclo_actual}
          onChange={v => update('costo_ciclo_actual', v)} placeholder="Ej. 2500000"
          error={errors.costo_ciclo_actual} />
      </Field>
      <Field label="Duración del ciclo (días)" required error={errors.dias_ciclo_actual}>
        <Input type="number" min="1" value={data.dias_ciclo_actual}
          onChange={v => update('dias_ciclo_actual', v)} placeholder="21"
          error={errors.dias_ciclo_actual} />
      </Field>
      <Field label="PFS estimado actual (meses)" required error={errors.pfs_actual_meses}
        naValue={pfsActualNA} onToggleNA={() => toggleNA('pfs_actual_meses')}
        hint="Si el paciente es naive (línea 0), marque 'No aplica'.">
        <Input type="number" step="0.1" min="0" value={data.pfs_actual_meses}
          onChange={v => update('pfs_actual_meses', v)} placeholder="Ej. 4.5"
          error={errors.pfs_actual_meses} />
      </Field>
      <Field label="OS estimado actual (meses)" required error={errors.os_actual_meses}
        naValue={osActualNA} onToggleNA={() => toggleNA('os_actual_meses')}
        hint="Información de referencia. No se usa en el cálculo económico.">
        <Input type="number" step="0.1" min="0" value={data.os_actual_meses}
          onChange={v => update('os_actual_meses', v)} placeholder="Ej. 13.5"
          error={errors.os_actual_meses} />
      </Field>

      {/* TRATAMIENTO PROPUESTO */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          💊 Tratamiento propuesto
        </h3>
      </div>
      <Field label="Costo por ciclo (COP)" required error={errors.costo_ciclo_propuesto}>
        <Input type="number" min="0" value={data.costo_ciclo_propuesto}
          onChange={v => update('costo_ciclo_propuesto', v)} placeholder="Ej. 8000000"
          error={errors.costo_ciclo_propuesto} />
      </Field>
      <Field label="Duración del ciclo (días)" required error={errors.dias_ciclo_propuesto}>
        <Input type="number" min="1" value={data.dias_ciclo_propuesto}
          onChange={v => update('dias_ciclo_propuesto', v)} placeholder="28"
          error={errors.dias_ciclo_propuesto} />
      </Field>
      <Field label="PFS esperado propuesto" hint="Tomado del paso Evidencia (ítem de cálculo)">
        <Input value={data.pfs_esperado_estudio ? `${data.pfs_esperado_estudio} meses` : ''} disabled
          placeholder="Llene primero el paso Evidencia" />
      </Field>
      <Field label="OS esperado propuesto" hint="Solo referencia clínica, no se calcula">
        <Input value={data.os_esperado_estudio ? `${data.os_esperado_estudio} meses` : ''} disabled
          placeholder="Llene primero el paso Evidencia" />
      </Field>

      {/* COMPLIANCE REGULATORIO */}
      <div className="md:col-span-2 mt-4">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wide mb-3">
          📋 Estatus regulatorio
        </h3>
      </div>
      <Field label="¿Tiene INVIMA?">
        <Select value={data.tiene_invima} onChange={v => update('tiene_invima', v)}
          options={[
            { value: 'si', label: 'Sí, registro INVIMA vigente' },
            { value: 'no', label: 'No tiene INVIMA' },
          ]} />
      </Field>
      <Field label="¿Está en base UNIRSE?">
        <Select value={data.en_unirse} onChange={v => update('en_unirse', v)}
          options={[
            { value: 'si', label: 'Sí, en UNIRSE' },
            { value: 'no', label: 'No está en UNIRSE' },
          ]} />
      </Field>

      {/* PROYECCIÓN AUTOMÁTICA */}
      {proyeccion ? (
        <div className="md:col-span-2 mt-6 bg-gradient-to-br from-blue-50 to-indigo-50 border-2 border-blue-200 rounded-xl p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-bold text-blue-900 uppercase tracking-wide">
              📊 Proyección de impacto económico
            </h3>
            <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
              Cálculo basado en PFS
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <CardActual proy={proyeccion} />
            <CardPropuesto proy={proyeccion} />
          </div>

          <div className="bg-white rounded-lg p-4 border-2 border-blue-300">
            <div className="text-[11px] font-bold text-blue-900 uppercase mb-3">
              ⚖️ Diferencial (propuesto − actual)
            </div>
            {proyeccion.diferencial.es_naive ? (
              <div className="text-sm text-slate-700 italic">
                Paciente naive (sin tratamiento previo). No hay base de comparación; solo se proyecta el costo total del propuesto.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <DiffRow
                  label="Diferencia hasta progresión (PFS)"
                  value={proyeccion.diferencial.diferencia_pfs} />
                <DiffRow
                  label={`Costo por mes ganado de PFS (${proyeccion.diferencial.ganancia_pfs_meses > 0 ? '+' : ''}${proyeccion.diferencial.ganancia_pfs_meses}m)`}
                  value={proyeccion.diferencial.costo_por_mes_pfs_ganado} />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="md:col-span-2 mt-4 bg-amber-50 border-2 border-amber-200 rounded-xl p-4 text-sm text-amber-900">
          ⚠️ Llene los costos por ciclo, las duraciones, y el PFS del paso Evidencia para ver la proyección automática.
        </div>
      )}
    </Section>
  )
}

function CardActual({ proy }) {
  const a = proy.actual
  const naive = a.pfs_meses == null
  return (
    <div className="bg-white rounded-lg p-3 border border-blue-100">
      <div className="text-[11px] font-bold text-slate-700 uppercase mb-2">Tratamiento actual</div>
      {naive ? (
        <div className="text-xs text-slate-500 italic py-3">
          PFS marcado como "No aplica" — paciente naive.<br />
          No hay cálculo de costo previo.
        </div>
      ) : (
        <div className="space-y-1 text-sm">
          <Row label={`Ciclos en PFS (${a.pfs_meses}m)`}
            value={`${a.ciclos_pfs} × ${fmtCOP(a.costo_ciclo)}`} />
          <Row label="= Costo total PFS" value={fmtCOP(a.total_pfs)} bold />
          {a.os_meses != null && (
            <>
              <hr className="my-1 border-slate-200" />
              <div className="opacity-50">
                <Row label={`Ciclos en OS (${a.os_meses}m)`}
                  value={`${a.ciclos_os} × ${fmtCOP(a.costo_ciclo)}`} small />
                <Row label="Costo total OS (referencia)" value={fmtCOP(a.total_os)} small />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function CardPropuesto({ proy }) {
  const p = proy.propuesto
  return (
    <div className="bg-white rounded-lg p-3 border border-blue-100">
      <div className="text-[11px] font-bold text-blue-800 uppercase mb-2">Tratamiento propuesto</div>
      <div className="space-y-1 text-sm">
        <Row label={`Ciclos en PFS (${p.pfs_meses}m)`}
          value={`${p.ciclos_pfs} × ${fmtCOP(p.costo_ciclo)}`} />
        <Row label="= Costo total PFS" value={fmtCOP(p.total_pfs)} bold />
        {p.os_meses != null && (
          <>
            <hr className="my-1 border-slate-200" />
            <div className="opacity-50">
              <Row label={`Ciclos en OS (${p.os_meses}m)`}
                value={`${p.ciclos_os} × ${fmtCOP(p.costo_ciclo)}`} small />
              <Row label="Costo total OS (referencia)" value={fmtCOP(p.total_os)} small />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Row({ label, value, bold, small }) {
  return (
    <div className="flex justify-between items-baseline gap-2">
      <span className={`text-slate-600 ${small ? 'text-[11px]' : 'text-xs'}`}>{label}</span>
      <span className={`text-slate-900 ${bold ? 'font-bold' : ''} ${small ? 'text-xs' : ''}`}>{value}</span>
    </div>
  )
}

function DiffRow({ label, value }) {
  if (value == null) return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className="text-slate-400 italic text-sm">No calculable</div>
    </div>
  )
  const positive = value > 0
  return (
    <div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide">{label}</div>
      <div className={`font-bold text-base ${positive ? 'text-rose-700' : 'text-emerald-700'}`}>
        {positive ? '+ ' : '− '}{fmtCOP(Math.abs(value))}
      </div>
    </div>
  )
}

function StepAdjuntos({ data, update }) {
  const [uploading, setUploading] = useState(false)
  const sanitize = (name) => name.replace(/[^\w.\-]/g, '_').replace(/_+/g, '_')

  const onUpload = async (e) => {
    const files = Array.from(e.target.files || [])
    if (!files.length) return
    setUploading(true)
    try {
      const nuevos = []
      for (const file of files) {
        const cleanName = sanitize(file.name)
        const path = `casos/${Date.now()}_${cleanName}`
        const { error } = await supabase.storage
          .from('adjuntos').upload(path, file, { upsert: false })
        if (error) throw error
        nuevos.push({ name: file.name, path, size: file.size, type: file.type })
      }
      update('adjuntos', [...(data.adjuntos || []), ...nuevos])
      toast.success(`${files.length} archivo(s) cargado(s)`)
    } catch (err) {
      toast.error(`Error al subir: ${err.message}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const remove = async (idx) => {
    const file = data.adjuntos[idx]
    try {
      await supabase.storage.from('adjuntos').remove([file.path])
    } catch { /* ignore */ }
    const next = data.adjuntos.filter((_, i) => i !== idx)
    update('adjuntos', next)
  }

  return (
    <Section title="Adjuntos" description="PDFs de imágenes, patología, consentimientos y resúmenes clínicos" icon={Paperclip}>
      <div className="md:col-span-2">
        <label className="block">
          <div className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
            uploading ? 'border-blue-400 bg-blue-50' : 'border-slate-400 hover:border-blue-500 hover:bg-slate-50'
          }`}>
            <Paperclip className="w-10 h-10 mx-auto mb-2 text-slate-500" />
            <p className="text-sm font-semibold text-slate-800">
              {uploading ? 'Subiendo archivos...' : 'Haga clic o arrastre archivos aquí'}
            </p>
            <p className="text-xs text-slate-600 mt-1">PDF, JPG, PNG · máximo 25 MB por archivo</p>
          </div>
          <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png"
            onChange={onUpload} className="hidden" disabled={uploading} />
        </label>

        {data.adjuntos?.length > 0 && (
          <div className="mt-4 space-y-2">
            {data.adjuntos.map((f, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 min-w-0">
                  <FileCheck2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span className="text-sm text-slate-800 truncate">{f.name}</span>
                  <span className="text-xs text-slate-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                </div>
                <button onClick={() => remove(i)}
                  className="text-xs text-red-600 hover:text-red-700 ml-2 font-semibold">Eliminar</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </Section>
  )
}
