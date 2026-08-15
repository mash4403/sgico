import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import {
  LayoutDashboard, FolderOpen, ClipboardCheck,
  ClipboardPlus, LogOut
} from 'lucide-react'
import ElCircuito from './ElCircuito'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/presentar', icon: ClipboardPlus, label: 'Presentar caso' },
  { to: '/casos', icon: FolderOpen, label: 'Casos' },
  { to: '/seguimientos', icon: ClipboardCheck, label: 'Seguimientos' },
]

export default function Layout({ children, session }) {
  const navigate = useNavigate()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/')
  }

  return (
    <div className="min-h-screen flex">
      {/* Sidebar */}
      <aside className="w-60 border-r border-niebla/15 flex flex-col bg-tinta-2">
        {/* Logo */}
        <div className="p-5 border-b border-niebla/15">
          <div className="flex items-center gap-3">
            <ElCircuito size={34} />
            <div>
              <div className="font-display font-bold text-sm tracking-tight text-hueso">SGICO</div>
              <div className="text-[10px] font-mono text-niebla-oscura uppercase tracking-[0.2em]">Comité Oncológico</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
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
          <div className="mt-4 text-[10px] text-niebla-oscura">
            <span className="nv" style={{ fontSize: '0.75rem' }}>Nodo<i>via</i></span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-[1200px]">
          {children}
        </div>
      </main>
    </div>
  )
}
