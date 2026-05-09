import { useState, useEffect } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Casos from './pages/Casos'
import CasoDetalle from './pages/CasoDetalle'
import PresentacionComite from './pages/PresentacionComite'
import Seguimientos from './pages/Seguimientos'

export default function App() {
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
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

  return (
    <>
      <Layout session={session}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/casos" element={<Casos />} />
          <Route path="/casos/:id" element={<CasoDetalle />} />
          <Route path="/presentar" element={<PresentacionComite />} />
          <Route path="/seguimientos" element={<Seguimientos />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Layout>
      <Toaster position="top-right" />
    </>
  )
}
