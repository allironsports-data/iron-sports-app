import type { Profile } from "../contexts/AuthContext";

interface ManagerSelectProps {
  value: string | undefined;            // avatar (siglas) del gestor seleccionado
  onChange: (avatar: string | undefined) => void;
  profiles: Profile[];
  className?: string;
  placeholder?: string;                 // texto de la opción vacía
}

/**
 * Selector de Gestor AIS mapeado a los miembros del equipo.
 * El valor guardado sigue siendo el `avatar` (siglas) del perfil,
 * por compatibilidad con los datos existentes (campo aisManager).
 */
export function ManagerSelect({ value, onChange, profiles, className = "", placeholder = "Sin gestor" }: ManagerSelectProps) {
  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));
  // Si el valor guardado no corresponde a ningún perfil (dato antiguo), lo conservamos como opción.
  const orphan = value && !profiles.some(p => p.avatar === value) ? value : null;

  return (
    <select
      value={value ?? ""}
      onChange={e => onChange(e.target.value || undefined)}
      className={className || "w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 bg-white"}
      aria-label="Gestor AIS"
    >
      <option value="">{placeholder}</option>
      {sorted.map(p => (
        <option key={p.id} value={p.avatar}>
          {p.name} ({p.avatar})
        </option>
      ))}
      {orphan && <option value={orphan}>{orphan}</option>}
    </select>
  );
}
