import { useCallback, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { User } from '@supabase/supabase-js'
import { AuthContext } from './authContext'

export interface Profile {
  id: string
  name: string
  avatar: string
  is_admin: boolean
  hidden_from_status?: boolean   // oculto en el panel de estado del equipo (lo gestiona un admin)
  captacion_only?: boolean       // cuenta restringida: solo ve Captación (Jugadores, Partidos, Informes)
  activo?: boolean               // cuenta aprobada por un admin. Sin esto, la base de datos no le entrega nada
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [profileMissing, setProfileMissing] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)

  const fetchProfile = useCallback(async (userId: string) => {
    // maybeSingle: si la fila no existe no es un error de red, es un perfil
    // sin crear — lo señalamos para que la app lo explique en vez de
    // devolver al login en bucle.
    const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle()
    setProfileMissing(!error && !data)
    // Un fallo de red/RLS no es «perfil inexistente»: lo guardamos aparte
    // para que la app pueda ofrecer reintentar en vez de un spinner eterno.
    if (error) {
      console.error('Error cargando el perfil', error)
      setProfileError(error.message || 'No se pudo cargar el perfil')
    } else {
      setProfileError(null)
    }
    if (data) {
      setProfile({
        id: data.id,
        name: data.name ?? '',
        avatar: data.avatar ?? '',
        is_admin: data.is_admin ?? false,
        hidden_from_status: data.hidden_from_status ?? false,
        captacion_only: data.captacion_only ?? false,
        // Si la columna todavía no existe en la base de datos (migración sin
        // ejecutar), se da por activa: así nadie se queda fuera por esperar.
        activo: data.activo ?? true,
      })
    }
  }, [])

  useEffect(() => {
    // Check initial session. finally: si getSession falla, loading se
    // quedaba en true para siempre y la app no salía del spinner.
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session?.user) {
          setUser(session.user)
          void fetchProfile(session.user.id)
        }
      })
      .catch(err => console.error('Error recuperando la sesión', err))
      .finally(() => setLoading(false))

    // Listen for auth changes — ignore token refreshes for the same user
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        // Only update user state if it's a genuinely new session (not just a token refresh)
        setUser(prev => {
          if (prev?.id === session.user.id) return prev   // same user → keep stable reference
          fetchProfile(session.user.id)
          return session.user
        })
      } else {
        setUser(null)
        setProfile(null)
      }
    })

    return () => subscription.unsubscribe()
  }, [fetchProfile])

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id)
  }, [user, fetchProfile])

  const signIn = async (email: string, password: string): Promise<string | null> => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return error.message
    return null
  }

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
    setProfileMissing(false)
    setProfileError(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, profileMissing, profileError, refreshProfile, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}
