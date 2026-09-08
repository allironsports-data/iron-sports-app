import {
  cloneElement, forwardRef, isValidElement, useId,
  type InputHTMLAttributes, type ReactElement, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react'
import { cn } from '../../lib/cn'

// ═════════════════════════════════════════════════════════════
// Field: label + control + hint + error, con ids y aria enlazados.
// Input / Select / Textarea: controles base con la clase `.ui-input`.
// ═════════════════════════════════════════════════════════════

/** Props que Field inyecta en el control hijo. */
export interface FieldControlProps {
  id: string
  'aria-describedby'?: string
  'aria-invalid'?: boolean
  'aria-required'?: boolean
}

export interface FieldProps {
  label: ReactNode
  /** Texto de ayuda bajo el control */
  hint?: ReactNode
  /** Mensaje de error (pinta en rojo y marca aria-invalid) */
  error?: ReactNode
  required?: boolean
  /** Id fijo (por defecto se genera con useId) */
  id?: string
  className?: string
  /** Un elemento (se le clona el id y los aria) o una función render que los recibe. */
  children: ReactElement<FieldControlProps> | ((p: FieldControlProps) => ReactNode)
}

export function Field({ label, hint, error, required, id: idProp, className, children }: FieldProps) {
  const autoId = useId()
  const id = idProp ?? `f${autoId}`
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined

  const controlProps: FieldControlProps = {
    id,
    'aria-describedby': describedBy,
    'aria-invalid': error ? true : undefined,
    'aria-required': required || undefined,
  }

  const control = typeof children === 'function'
    ? children(controlProps)
    : isValidElement(children) ? cloneElement(children, controlProps) : children

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <label htmlFor={id} className="text-meta font-semibold text-slate-600">
        {label}
        {required && <span aria-hidden="true" className="text-red-600 ml-0.5">*</span>}
      </label>
      {control}
      {error && (
        <p id={errorId} role="alert" className="text-meta text-red-600">{error}</p>
      )}
      {hint && !error && (
        <p id={hintId} className="text-meta text-slate-500">{hint}</p>
      )}
    </div>
  )
}

interface InvalidProp {
  /** Marca visualmente el control como inválido (aria-invalid) */
  invalid?: boolean
}

export interface InputProps extends InputHTMLAttributes<HTMLInputElement>, InvalidProp {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, 'aria-invalid': ariaInvalid, ...rest }, ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || ariaInvalid || undefined}
      className={cn('ui-input', className)}
      {...rest}
    />
  )
})

export interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement>, InvalidProp {}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { invalid, className, 'aria-invalid': ariaInvalid, children, ...rest }, ref,
) {
  return (
    <select
      ref={ref}
      aria-invalid={invalid || ariaInvalid || undefined}
      className={cn('ui-input', className)}
      {...rest}
    >
      {children}
    </select>
  )
})

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, InvalidProp {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, 'aria-invalid': ariaInvalid, rows = 3, ...rest }, ref,
) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      aria-invalid={invalid || ariaInvalid || undefined}
      className={cn('ui-input resize-y', className)}
      {...rest}
    />
  )
})
