import { NavLink, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { 
  LayoutDashboard, FilePlus, FolderOpen, ClipboardCheck, 
  Bell, LogOut, Activity 
} from 'lucide-react'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/nuevo', icon: FilePlus, label: 'Nuevo caso' },
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
      <aside className="w-60 border-r border-white/5 flex flex-col" 
             style={{ background: 'rgba(255,255,255,0.02)' }}>
        {/* Logo */}
        <div className="p-5 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center font-bold text-white"
                 style={{ background: 'linear-gradient(135deg, #3b82f6, #06b6d4)' }}>
              <Activity size={18} />
            </div>
            <div>
              <div className="font-bold text-sm tracking-tight">SGICO</div>
              <div className="text-[10px] text-gray-500 tracking-wider">COMITÉ ONCOLÓGICO</div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 p-3 flex flex-col gap-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive 
                    ? 'bg-blue-500/10 text-blue-400 font-medium' 
                    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
                }`
              }>
              <Icon size={18} />
              {label}
            </NavLink>
          ))}
        </nav>

        {/* User */}
        <div className="p-4 border-t border-white/5">
          <div className="text-xs text-gray-500 truncate mb-2">
            {session?.user?.email}
          </div>
          <button onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-gray-400 hover:text-red-400 transition-colors">
            <LogOut size={16} />
            Cerrar sesión
          </button>
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
