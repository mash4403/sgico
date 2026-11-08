import { useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, FolderOpen, ClipboardCheck,
  ClipboardPlus, LogOut, CalendarClock, Users, Landmark, CalendarPlus
} from 'lucide-react'
import ElCircuito from './ElCircuito'
import LogoInoos from './LogoInoos'
import NuevoComiteModal from './NuevoComiteModal'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/presentar', icon: ClipboardPlus, label: 'Presentar caso' },
  { to: '/agenda', icon: CalendarClock, label: 'Casos para comité' },
  { to: '/casos', icon: FolderOpen, label: 'Casos' },
  { to: '/comites', icon: Landmark, label: 'Comités' },
  { to: '/seguimientos', icon: ClipboardCheck, label: 'Seguimientos' },
  { to: '/miembros', icon: Users, label: 'Miembros del comité' },
]

export default function Layout({ children, session }) {
  const navigate = useNavigate()
  const [nuevoComite, setNuevoComite] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="no-print w-60 border-r border-niebla/15 flex flex-col bg-tinta-2">
        {/* Logo */}
        <div className="p-5 border-b border-niebla/15">
          <LogoInoos className="w-full max-w-[180px] h-auto" />
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-display font-bold text-sm tracking-tight text-hueso">SGICO</span>
            <span className="text-[10px] font-mono text-niebla-oscura uppercase tracking-[0.18em]">Comité Oncológico</span>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          <button type="button" onClick={() => setNuevoComite(true)}
            className="flex items-center gap-3 px-3 py-2.5 mb-2 rounded-xl text-sm font-medium
                       text-tinta bg-pulso hover:bg-pulso-oscuro transition-all">
            <CalendarPlus size={18} />
            Nuevo comité
          </button>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-all ${
                  isActive
                    ? 'bg-pulso/10 text-pulso font-medium'
                    : 'text-niebla hover:text-hueso hover:bg-hueso/5'
                }`
              }>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-niebla/15">
          <div className="text-xs text-niebla-oscura truncate mb-2">
            {session?.user?.email}
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-niebla hover:text-peligro transition-colors">
            <LogOut size={16} />
            Cerrar sesión
          </button>
          <div className="mt-4 flex items-center gap-1.5 text-[10px] text-niebla-oscura">
            <span>by</span>
            <ElCircuito size={14} />
            <span className="nv" style={{ fontSize: '0.75rem' }}>Nodo<i>via</i></span>
          </div>
        </div>
      </aside>

      {nuevoComite && (
        <NuevoComiteModal
          onClose={() => setNuevoComite(false)}
          onCreado={(s) => { setNuevoComite(false); navigate('/comites', { state: { creado: s.id } }) }} />
      )}

      {/* Main content */}
      <main className="flex-1 overflow-auto print:overflow-visible">
        <div className="p-6 max-w-[1200px] print:p-0 print:max-w-none">
          {children}
        </div>
      </main>
    </div>
  )
}
