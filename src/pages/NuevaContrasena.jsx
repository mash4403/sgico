import { useState } from 'react'
import toast from 'react-hot-toast'
import { Eye, EyeOff } from 'lucide-react'
import { supabase } from '../lib/supabase'
import LogoInoos from '../components/LogoInoos'

export const MIN_CONTRASENA = 12

// Se muestra al abrir el enlace de invitación o de recuperación de contraseña:
// el usuario ya tiene sesión, pero debe definir su contraseña antes de seguir.
export default function NuevaContrasena({ invitacion = false, onListo }) {
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [ver, setVer] = useState(false)
  const [guardando, setGuardando] = useState(false)

  const guardar = async (e) => {
    e.preventDefault()
    if (pass.length < MIN_CONTRASENA) return toast.error(`La contraseña debe tener al menos ${MIN_CONTRASENA} caracteres`)
    if (pass !== pass2) return toast.error('Las contraseñas no coinciden')
    setGuardando(true)
    const { error } = await supabase.auth.updateUser({ password: pass })
    setGuardando(false)
    if (error) return toast.error(error.message)
    toast.success('Contraseña guardada')
    onListo()
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <form onSubmit={guardar} className="w-full max-w-sm space-y-4">
        <LogoInoos className="w-56 max-w-full h-auto mx-auto mb-4" />
        <h1 className="text-lg font-semibold text-center">
          {invitacion ? 'Bienvenido a SGICO: crea tu contraseña' : 'Crea una nueva contraseña'}
        </h1>
        <div>
          <label className="block text-xs mb-1.5 font-medium">Nueva contraseña (mínimo {MIN_CONTRASENA} caracteres)</label>
          <div className="relative">
            <input type={ver ? 'text' : 'password'} value={pass} onChange={e => setPass(e.target.value)}
              autoComplete="new-password" required className="pr-10" />
            <button type="button" onClick={() => setVer(v => !v)} title={ver ? 'Ocultar' : 'Ver'}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-niebla-oscura hover:text-niebla">
              {ver ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-xs mb-1.5 font-medium">Repite la contraseña</label>
          <input type={ver ? 'text' : 'password'} value={pass2} onChange={e => setPass2(e.target.value)}
            autoComplete="new-password" required />
        </div>
        <button type="submit" disabled={guardando}
          className="w-full py-2.5 rounded-full font-display font-semibold text-sm text-tinta bg-pulso hover:bg-pulso-oscuro transition-all disabled:opacity-50">
          {guardando ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </div>
  )
}
