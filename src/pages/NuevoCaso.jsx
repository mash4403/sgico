import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Save, ArrowLeft, Search } from 'lucide-react'

const STEPS = ['Paciente', 'Comité', 'Propuesta', 'Costos']

export default function NuevoCaso() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [catalogos, setCatalogos] = useState({ sedes: [], eps: [], medicos: [], protocolos: [] })

  // Form state
  const [paciente, setPaciente] = useState({
    tipo_documento: 'CC', documento: '', nombre: '', genero: 'M',
    fecha_nacimiento: '', telefono1: '', eps_id: '', sede_id: '',
  })
  const [diagnostico, setDiagnostico] = useState({
    cie10: '', descripcion: '', estadio: '', histologia: '',
    ecog: '', metastasis_sitios: '',
  })
  const [caso, setCaso] = useState({
    fecha_solicitud: new Date().toISOString().split('T')[0],
    tipo_comite: 'tumor_solido', motivo: '', medico_id: '',
    linea_actual: '', linea_propuesta: '',
    molecula_propuesta: '', justificacion: '',
    tiene_invima: false, en_unirse: false,
    protocolo_id: '', presentacion_obligatoria: false,
    tratamiento_previo: '', molecula_previa: '', costo_previo: 0,
    valoracion_psicosocial: false,
  })

  // Buscar paciente existente
  const [buscando, setBuscando] = useState(false)
  const [pacienteExistente, setPacienteExistente] = useState(null)

  useEffect(() => {
    const loadCatalogos = async () => {
      const [sedes, eps, medicos, protocolos] = await Promise.all([
        supabase.from('sedes').select('*').eq('activa', true),
        supabase.from('eps').select('*').eq('activa', true).order('nombre'),
        supabase.from('medicos').select('*').eq('activo', true),
        supabase.from('protocolos').select('*').eq('activo', true),
      ])
      setCatalogos({
        sedes: sedes.data || [],
        eps: eps.data || [],
        medicos: medicos.data || [],
        protocolos: protocolos.data || [],
      })
    }
    loadCatalogos()
  }, [])

  const buscarPaciente = async () => {
    if (!paciente.documento) return
    setBuscando(true)
    const { data } = await supabase.from('pacientes')
      .select('*, diagnosticos(*)')
      .eq('documento', paciente.documento)
      .single()
    if (data) {
      setPacienteExistente(data)
      setPaciente({
        ...paciente,
        nombre: data.nombre,
        genero: data.genero,
        fecha_nacimiento: data.fecha_nacimiento || '',
        telefono1: data.telefono1 || '',
        eps_id: data.eps_id || '',
        sede_id: data.sede_id || '',
      })
      if (data.diagnosticos?.length > 0) {
        const dx = data.diagnosticos[data.diagnosticos.length - 1]
        setDiagnostico({
          cie10: dx.cie10 || '',
          descripcion: dx.descripcion || '',
          estadio: dx.estadio || '',
          histologia: dx.histologia || '',
          ecog: dx.ecog || '',
          metastasis_sitios: dx.metastasis_sitios || '',
        })
      }
      toast.success('Paciente encontrado')
    } else {
      setPacienteExistente(null)
      toast('Paciente nuevo — completar datos', { icon: 'ℹ️' })
    }
    setBuscando(false)
  }

  const handleSubmit = async () => {
    setSaving(true)
    try {
      // 1. Crear o reutilizar paciente
      let pacienteId = pacienteExistente?.id
      if (!pacienteId) {
        const { data: newPac, error: pacErr } = await supabase.from('pacientes')
          .insert({
            tipo_documento: paciente.tipo_documento,
            documento: paciente.documento,
            nombre: paciente.nombre,
            genero: paciente.genero,
            fecha_nacimiento: paciente.fecha_nacimiento || null,
            telefono1: paciente.telefono1,
            eps_id: paciente.eps_id || null,
            sede_id: paciente.sede_id || null,
          })
          .select().single()
        if (pacErr) throw pacErr
        pacienteId = newPac.id
      }

      // 2. Crear diagnóstico
      const { data: newDx, error: dxErr } = await supabase.from('diagnosticos')
        .insert({
          paciente_id: pacienteId,
          cie10: diagnostico.cie10,
          descripcion: diagnostico.descripcion,
          estadio: diagnostico.estadio,
          histologia: diagnostico.histologia,
          ecog: diagnostico.ecog ? parseInt(diagnostico.ecog) : null,
          metastasis_sitios: diagnostico.metastasis_sitios,
          fecha_diagnostico: new Date().toISOString().split('T')[0],
        })
        .select().single()
      if (dxErr) throw dxErr

      // 3. Crear caso comité
      const { data: newCaso, error: casoErr } = await supabase.from('casos_comite')
        .insert({
          paciente_id: pacienteId,
          diagnostico_id: newDx.id,
          medico_id: caso.medico_id || null,
          sede_id: paciente.sede_id || null,
          fecha_solicitud: caso.fecha_solicitud,
          tipo_comite: caso.tipo_comite,
          motivo: caso.motivo,
          linea_actual: caso.linea_actual ? parseInt(caso.linea_actual) : null,
          linea_propuesta: caso.linea_propuesta ? parseInt(caso.linea_propuesta) : null,
          molecula_propuesta: caso.molecula_propuesta,
          justificacion: caso.justificacion,
          tiene_invima: caso.tiene_invima,
          en_unirse: caso.en_unirse,
          protocolo_id: caso.protocolo_id || null,
          presentacion_obligatoria: caso.presentacion_obligatoria,
          tratamiento_previo: caso.tratamiento_previo,
          molecula_previa: caso.molecula_previa,
          costo_previo: parseFloat(caso.costo_previo) || 0,
          valoracion_psicosocial: caso.valoracion_psicosocial,
        })
        .select().single()
      if (casoErr) throw casoErr

      toast.success('Caso registrado exitosamente')
      navigate('/casos')
    } catch (err) {
      console.error(err)
      toast.error(`Error: ${err.message}`)
    } finally {
      setSaving(false)
    }
  }

  const inputClass = "w-full"
  const labelClass = "block text-xs text-gray-400 mb-1.5 font-medium"

  return (
    <div className="max-w-3xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => navigate(-1)} className="text-gray-500 hover:text-gray-300">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Nuevo caso</h1>
          <p className="text-sm text-gray-500">Registro de caso para comité oncológico</p>
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8">
        {STEPS.map((s, i) => (
          <button key={i} onClick={() => setStep(i)}
            className={`flex-1 py-2 text-xs font-medium rounded-lg transition-all ${
              i === step 
                ? 'bg-blue-500/15 text-blue-400 border border-blue-500/30' 
                : i < step 
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                  : 'bg-white/5 text-gray-500 border border-white/5'
            }`}>
            {i + 1}. {s}
          </button>
        ))}
      </div>

      {/* Step 0: Paciente */}
      {step === 0 && (
        <div className="space-y-4 rounded-xl p-6 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Datos del paciente</h3>
          
          {/* Búsqueda */}
          <div className="flex gap-3">
            <div className="w-32">
              <label className={labelClass}>Tipo doc.</label>
              <select value={paciente.tipo_documento} 
                onChange={e => setPaciente({...paciente, tipo_documento: e.target.value})}>
                <option value="CC">CC</option>
                <option value="TI">TI</option>
                <option value="CE">CE</option>
                <option value="PA">PA</option>
              </select>
            </div>
            <div className="flex-1">
              <label className={labelClass}>Documento</label>
              <div className="flex gap-2">
                <input value={paciente.documento} placeholder="Número de documento"
                  onChange={e => setPaciente({...paciente, documento: e.target.value})}
                  onKeyDown={e => e.key === 'Enter' && buscarPaciente()} />
                <button onClick={buscarPaciente} disabled={buscando}
                  className="px-3 rounded-lg bg-blue-500/10 border border-blue-500/20 
                             text-blue-400 hover:bg-blue-500/20 transition-all flex-shrink-0">
                  <Search size={16} />
                </button>
              </div>
            </div>
          </div>

          {pacienteExistente && (
            <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 text-sm text-green-400">
              Paciente existente: {pacienteExistente.nombre}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Nombre completo</label>
              <input value={paciente.nombre} placeholder="Nombre completo del paciente"
                onChange={e => setPaciente({...paciente, nombre: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>Género</label>
              <select value={paciente.genero}
                onChange={e => setPaciente({...paciente, genero: e.target.value})}>
                <option value="M">Masculino</option>
                <option value="F">Femenino</option>
                <option value="O">Otro</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Fecha nacimiento</label>
              <input type="date" value={paciente.fecha_nacimiento}
                onChange={e => setPaciente({...paciente, fecha_nacimiento: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>Teléfono</label>
              <input value={paciente.telefono1} placeholder="300 000 0000"
                onChange={e => setPaciente({...paciente, telefono1: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>EPS</label>
              <select value={paciente.eps_id}
                onChange={e => setPaciente({...paciente, eps_id: e.target.value})}>
                <option value="">Seleccionar...</option>
                {catalogos.eps.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Sede</label>
              <select value={paciente.sede_id}
                onChange={e => setPaciente({...paciente, sede_id: e.target.value})}>
                <option value="">Seleccionar...</option>
                {catalogos.sedes.map(s => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          </div>

          <h3 className="text-sm font-semibold text-gray-300 mt-6 mb-4">Diagnóstico</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>CIE-10</label>
              <input value={diagnostico.cie10} placeholder="Ej: C34.9"
                onChange={e => setDiagnostico({...diagnostico, cie10: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>Estadio</label>
              <select value={diagnostico.estadio}
                onChange={e => setDiagnostico({...diagnostico, estadio: e.target.value})}>
                <option value="">Seleccionar...</option>
                {['I','IA','IB','II','IIA','IIB','III','IIIA','IIIB','IIIC','IV','IVA','IVB'].map(s => 
                  <option key={s} value={s}>{s}</option>
                )}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Descripción diagnóstico</label>
              <input value={diagnostico.descripcion} placeholder="Adenocarcinoma de pulmón..."
                onChange={e => setDiagnostico({...diagnostico, descripcion: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>Histología</label>
              <input value={diagnostico.histologia} placeholder="Tipo histológico"
                onChange={e => setDiagnostico({...diagnostico, histologia: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>ECOG</label>
              <select value={diagnostico.ecog}
                onChange={e => setDiagnostico({...diagnostico, ecog: e.target.value})}>
                <option value="">Seleccionar...</option>
                {[0,1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Sitios de metástasis</label>
              <input value={diagnostico.metastasis_sitios} placeholder="Hígado, pulmón, hueso..."
                onChange={e => setDiagnostico({...diagnostico, metastasis_sitios: e.target.value})} />
            </div>
          </div>
        </div>
      )}

      {/* Step 1: Comité */}
      {step === 1 && (
        <div className="space-y-4 rounded-xl p-6 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Información del comité</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>Fecha solicitud</label>
              <input type="date" value={caso.fecha_solicitud}
                onChange={e => setCaso({...caso, fecha_solicitud: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>Tipo de comité</label>
              <select value={caso.tipo_comite}
                onChange={e => setCaso({...caso, tipo_comite: e.target.value})}>
                <option value="tumor_solido">Tumor sólido</option>
                <option value="hematologico">Hematológico</option>
                <option value="pediatrico">Pediátrico</option>
                <option value="multidisciplinario">Multidisciplinario</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Médico solicitante</label>
              <select value={caso.medico_id}
                onChange={e => setCaso({...caso, medico_id: e.target.value})}>
                <option value="">Seleccionar...</option>
                {catalogos.medicos.map(m => 
                  <option key={m.id} value={m.id}>{m.nombre} — {m.especialidad}</option>
                )}
              </select>
            </div>
            <div>
              <label className={labelClass}>Presentación obligatoria</label>
              <select value={caso.presentacion_obligatoria}
                onChange={e => setCaso({...caso, presentacion_obligatoria: e.target.value === 'true'})}>
                <option value="true">Sí — protocolo de obligatoria presentación</option>
                <option value="false">No — fuera de protocolo obligatorio</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Motivo de presentación</label>
              <textarea rows={3} value={caso.motivo} placeholder="Describir motivo de presentación en comité..."
                onChange={e => setCaso({...caso, motivo: e.target.value})}
                className="w-full" />
            </div>
            <div>
              <label className={labelClass}>Línea de tratamiento actual</label>
              <select value={caso.linea_actual}
                onChange={e => setCaso({...caso, linea_actual: e.target.value})}>
                <option value="">Sin tratamiento previo</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}ª línea</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>Línea propuesta</label>
              <select value={caso.linea_propuesta}
                onChange={e => setCaso({...caso, linea_propuesta: e.target.value})}>
                <option value="">Seleccionar...</option>
                {[1,2,3,4,5].map(n => <option key={n} value={n}>{n}ª línea</option>)}
              </select>
            </div>
          </div>
        </div>
      )}

      {/* Step 2: Propuesta */}
      {step === 2 && (
        <div className="space-y-4 rounded-xl p-6 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Propuesta terapéutica</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Molécula propuesta</label>
              <input value={caso.molecula_propuesta} placeholder="Pembrolizumab, Osimertinib..."
                onChange={e => setCaso({...caso, molecula_propuesta: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>¿Tiene INVIMA?</label>
              <select value={caso.tiene_invima}
                onChange={e => setCaso({...caso, tiene_invima: e.target.value === 'true'})}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>¿Está en UNIRSE?</label>
              <select value={caso.en_unirse}
                onChange={e => setCaso({...caso, en_unirse: e.target.value === 'true'})}>
                <option value="true">Sí</option>
                <option value="false">No</option>
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Protocolo institucional asociado</label>
              <select value={caso.protocolo_id}
                onChange={e => setCaso({...caso, protocolo_id: e.target.value})}>
                <option value="">Sin protocolo asociado</option>
                {catalogos.protocolos.map(p => 
                  <option key={p.id} value={p.id}>
                    {p.nombre} — {p.diagnostico} (L{p.linea_tratamiento})
                  </option>
                )}
              </select>
            </div>
            <div className="col-span-2">
              <label className={labelClass}>Justificación clínica</label>
              <textarea rows={3} value={caso.justificacion} 
                placeholder="Justificación de la propuesta terapéutica..."
                onChange={e => setCaso({...caso, justificacion: e.target.value})}
                className="w-full" />
            </div>
            <div className="col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={caso.valoracion_psicosocial}
                  onChange={e => setCaso({...caso, valoracion_psicosocial: e.target.checked})}
                  className="rounded" />
                <span className="text-sm text-gray-300">Requiere valoración psicosocial</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Step 3: Costos */}
      {step === 3 && (
        <div className="space-y-4 rounded-xl p-6 border border-white/5" style={{ background: 'rgba(255,255,255,0.03)' }}>
          <h3 className="text-sm font-semibold text-gray-300 mb-4">Tratamiento previo y costos</h3>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className={labelClass}>Descripción tratamiento previo</label>
              <textarea rows={2} value={caso.tratamiento_previo}
                placeholder="Esquema actual o previo del paciente..."
                onChange={e => setCaso({...caso, tratamiento_previo: e.target.value})}
                className="w-full" />
            </div>
            <div>
              <label className={labelClass}>Molécula previa</label>
              <input value={caso.molecula_previa} placeholder="Molécula actual"
                onChange={e => setCaso({...caso, molecula_previa: e.target.value})} />
            </div>
            <div>
              <label className={labelClass}>Costo tratamiento previo (COP)</label>
              <input type="number" value={caso.costo_previo} placeholder="0"
                onChange={e => setCaso({...caso, costo_previo: e.target.value})} />
            </div>
          </div>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6">
        <button onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
          className="px-4 py-2 rounded-lg text-sm text-gray-400 border border-white/10 
                     hover:border-white/20 disabled:opacity-30 transition-all">
          Anterior
        </button>
        {step < STEPS.length - 1 ? (
          <button onClick={() => {
            if (step === 0) {
              if (!paciente.documento.trim() || !paciente.nombre.trim()) {
                toast.error('Documento y nombre del paciente son requeridos')
                return
              }
            }
            setStep(step + 1)
          }}
            className="px-6 py-2 rounded-lg text-sm font-medium text-white transition-all"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
            Siguiente
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={saving}
            className="flex items-center gap-2 px-6 py-2 rounded-lg text-sm font-medium text-white 
                       disabled:opacity-50 transition-all"
            style={{ background: 'linear-gradient(135deg, #22c55e, #06b6d4)' }}>
            <Save size={16} />
            {saving ? 'Guardando...' : 'Registrar caso'}
          </button>
        )}
      </div>
    </div>
  )
}
