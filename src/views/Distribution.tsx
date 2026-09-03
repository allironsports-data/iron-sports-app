// La vista de Distribución vive ahora en ./distribution/ (partida en
// pestañas, paneles, modales y lógica pura en lib/distribution.ts).
// Este fichero se mantiene para que App.tsx siga importándola igual.
export { Distribution } from './distribution/Distribution'
export type { Props as DistributionProps } from './distribution/Distribution'
