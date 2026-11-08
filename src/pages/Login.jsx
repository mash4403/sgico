import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import ElCircuito from '../components/ElCircuito'
import LogoInoos from '../components/LogoInoos'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
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
          <LogoInoos className="w-64 max-w-full h-auto mx-auto mb-6" />
          <div className="flex items-center justify-center gap-3 mb-2" aria-hidden="true">
            <span className="h-px w-10" style={{ background: 'color-mix(in srgb, var(--marca) 40%, transparent)' }} />
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--marca)' }} />
            <span className="h-px w-10" style={{ background: 'color-mix(in srgb, var(--marca) 40%, transparent)' }} />
          </div>
          <div role="heading" aria-level={1}
            style={{ fontFamily: 'var(--f-body)', fontWeight: 300, fontSize: 26, letterSpacing: '0.42em', color: 'var(--marca)', paddingLeft: '0.42em' }}>
            SGICO
          </div>
          <p className="text-[12px] text-niebla mt-1.5">Sistema de gestión del comité oncológico</p>
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
            <div className="relative">
              <input type={showPass ? 'text' : 'password'} value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••" required minLength={6} className="pr-10" />
              <button type="button" onClick={() => setShowPass(s => !s)}
                title={showPass ? 'Ocultar contraseña' : 'Ver contraseña'}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-niebla-oscura hover:text-niebla">
                {showPass ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
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
        <div className="mt-10 flex items-center justify-center gap-1.5 text-xs text-niebla-oscura">
          <span>by</span>
          <ElCircuito size={16} />
          <span className="nv" style={{ fontSize: '0.85rem' }}>Nodo<i>via</i></span>
        </div>
      </div>
    </div>
  )
}
