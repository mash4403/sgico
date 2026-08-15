import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import ElCircuito from '../components/ElCircuito'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    try {
      const { error } = isSignUp
        ? await supabase.auth.signUp({ email, password })
        : await supabase.auth.signInWithPassword({ email, password })

      if (error) throw error
      if (isSignUp) toast.success('Cuenta creada. Revisa tu email para confirmar.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 mx-auto mb-4 flex items-center justify-center rounded-2xl border border-niebla/15 bg-tinta-2"
               style={{ boxShadow: 'inset 0 1px 0 rgba(53,201,182,0.2)' }}>
            <ElCircuito size={40} />
          </div>
          <h1 className="text-2xl font-display font-bold tracking-tight text-hueso">SGICO</h1>
          <p className="text-sm text-niebla mt-1">Rutas vivas de atención con IA</p>
          <p className="text-[10px] font-mono text-niebla-oscura uppercase tracking-[0.2em] mt-1">Comité Oncológico</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-niebla mb-1.5 font-medium">Correo electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@institucion.co" required />
          </div>
          <div>
            <label className="block text-xs text-niebla mb-1.5 font-medium">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-full font-display font-semibold text-sm text-tinta bg-pulso
                       hover:bg-pulso-oscuro transition-all disabled:opacity-50">
            {loading ? 'Cargando...' : isSignUp ? 'Crear cuenta' : 'Ingresar'}
          </button>
        </form>

        <button onClick={() => setIsSignUp(!isSignUp)}
          className="w-full mt-4 text-center text-sm text-niebla-oscura hover:text-niebla transition-colors">
          {isSignUp ? '¿Ya tienes cuenta? Ingresar' : '¿Primera vez? Crear cuenta'}
        </button>

        {/* Wordmark */}
        <div className="text-center mt-10">
          <span className="nv" style={{ fontSize: '0.85rem' }}>Nodo<i>via</i></span>
        </div>
      </div>
    </div>
  )
}
