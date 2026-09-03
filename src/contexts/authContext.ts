import { createContext } from 'react'
import type { User } from '@supabase/supabase-js'
import type { Profile } from './AuthContext'

// Contexto de autenticación (fuera del .tsx del provider por fast refresh)

export interface AuthState {
  user: User | null
  profile: Profile | null
  loading: boolean
  /** true si el usuario está autenticado pero NO existe su fila en profiles */
  profileMissing: boolean
  /** Mensaje de error si la carga del perfil falló (red, RLS…); null si fue bien */
  profileError: string | null
  /** Vuelve a pedir el perfil del usuario actual (para el botón «Reintentar») */
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const AuthContext = createContext<AuthState | null>(null)
