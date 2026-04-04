import { useState } from 'react'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'
import { Activity } from 'lucide-react'

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
          <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
               style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
            <Activity size={28} className="text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight">SGICO</h1>
          <p className="text-sm text-gray-500 mt-1">Sistema de Gestión Inteligente</p>
          <p className="text-xs text-gray-600">Comité Oncológico</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Correo electrónico</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="usuario@institucion.co" required />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Contraseña</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••" required minLength={6} />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2.5 rounded-lg font-medium text-sm text-white transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
            {loading ? 'Cargando...' : isSignUp ? 'Crear cuenta' : 'Ingresar'}
          </button>
        </form>

        <button onClick={() => setIsSignUp(!isSignUp)}
          className="w-full mt-4 text-center text-sm text-gray-500 hover:text-gray-300 transition-colors">
          {isSignUp ? '¿Ya tienes cuenta? Ingresar' : '¿Primera vez? Crear cuenta'}
        </button>
      </div>
    </div>
  )
}
