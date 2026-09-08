import type { Profile } from "../contexts/AuthContext";
import { Select } from "./ui";
import { L } from "../lib/labels";

interface ManagerSelectProps {
  value: string | undefined;            // avatar (siglas) del encargado seleccionado
  onChange: (avatar: string | undefined) => void;
  profiles: Profile[];
  className?: string;
  placeholder?: string;                 // texto de la opción vacía
}

/**
 * Selector de Encargado mapeado a los miembros del equipo.
 * El valor guardado sigue siendo el `avatar` (siglas) del perfil,
 * por compatibilidad con los datos existentes (campo aisManager).
 */
export function ManagerSelect({ value, onChange, profiles, className = "", placeholder = L.sinEncargado }: ManagerSelectProps) {
  const sorted = [...profiles].sort((a, b) => a.name.localeCompare(b.name));
  // Si el valor guardado no corresponde a ningún perfil (dato antiguo), lo conservamos como opción.
  const orphan = value && !profiles.some(p => p.avatar === value) ? value : null;

  return (
    <Select
      value={value ?? ""}
      onChange={e => onChange(e.target.value || undefined)}
      className={className || undefined}
      aria-label={L.encargado}
    >
      <option value="">{placeholder}</option>
      {sorted.map(p => (
        <option key={p.id} value={p.avatar}>
          {p.name} ({p.avatar})
        </option>
      ))}
      {orphan && <option value={orphan}>{orphan}</option>}
    </Select>
  );
}
