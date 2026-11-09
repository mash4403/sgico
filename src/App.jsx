import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase, tipoEnlaceInicial } from './lib/supabase'
import ErrorBoundary from './components/ErrorBoundary'
import NuevaContrasena from './pages/NuevaContrasena'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Casos from './pages/Casos'
import CasoDetalle from './pages/CasoDetalle'
import PresentacionComite from './pages/PresentacionComite'
import Agenda from './pages/Agenda'
import Comites from './pages/Comites'
import MesaComite from './pages/MesaComite'
import Seguimientos from './pages/Seguimientos'
import MiembrosComite from './pages/MiembrosComite'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  // Invitación o recuperación: el usuario entra con sesión pero debe crear su contraseña
  const [definirContrasena, setDefinirContrasena] = useState(
    tipoEnlaceInicial === 'invite' || tipoEnlaceInicial === 'recovery' ? tipoEnlaceInicial : null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session)
      if (event === 'PASSWORD_RECOVERY') setDefinirContrasena('recovery')
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-sgico-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-sgico-accent border-t-transparent rounded-full animate-spin" />
          <div className="text-gray-400 text-sm">Cargando SGICO...</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <>
        <Login />
        <Toaster position="top-right" />
      </>
    )
  }

  if (definirContrasena) {
    return (
      <>
        <NuevaContrasena invitacion={definirContrasena === 'invite'} onListo={() => setDefinirContrasena(null)} />
        <Toaster position="top-right" />
      </>
    )
  }

  return (
    <>
      <Layout session={session}>
        <ErrorBoundary>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/casos" element={<Casos />} />
          <Route path="/casos/:id" element={<CasoDetalle />} />
          <Route path="/casos/:id/acta" element={<MesaComite />} />
          <Route path="/agenda" element={<Agenda />} />
          <Route path="/comites" element={<Comites />} />
          <Route path="/presentar" element={<PresentacionComite />} />
          <Route path="/presentar/:id" element={<PresentacionComite />} />
          <Route path="/seguimientos" element={<Seguimientos />} />
          <Route path="/miembros" element={<MiembrosComite />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </ErrorBoundary>
      </Layout>
      <Toaster position="top-right" />
    </>
  )
}
