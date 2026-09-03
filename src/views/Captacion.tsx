// Vista Captación. El componente vive en ./captacion/Captacion.tsx y sus
// piezas (pestañas, panel lateral, pipeline Firmar, partidos…) en ./captacion/.
// Este fichero solo reexporta para que App.tsx siga haciendo
// `import('./views/Captacion')` sin cambios.
export { Captacion } from './captacion/Captacion'
export type { Props as CaptacionProps } from './captacion/types'
export { REPORT_TEMPLATE } from './captacion/helpers'
export { Captacion as default } from './captacion/Captacion'
