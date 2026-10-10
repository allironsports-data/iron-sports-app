10:19:49.641 
10:19:49.662 
╭ Warning ─────────────────────────────────────────────────────────────────────╮
10:19:49.662 
│                                                                              │
10:19:49.663 
│   Ignored build scripts: @parcel/watcher@2.5.6, @swc/core@1.15.21,           │
10:19:49.663 
│   lmdb@2.8.5, msgpackr-extract@3.0.3.                                        │
10:19:49.663 
│   Run "pnpm approve-builds" to pick which dependencies should be allowed     │
10:19:49.663 
│   to run scripts.                                                            │
10:19:49.664 
│                                                                              │
10:19:49.664 
╰──────────────────────────────────────────────────────────────────────────────╯
10:19:49.668 
Done in 1.4s using pnpm v10.28.0
10:19:49.713 
Running "pnpm run build"
10:19:50.134 
10:19:50.135 
> iron-sports-app@0.0.0 build /vercel/path0
10:19:50.135 
> tsc -b && vite build
10:19:50.135 
10:20:16.481 
src/views/captacion/Captacion.tsx(1330,11): error TS2322: Type '"personalidad" | "mercado" | "entorno" | undefined' is not assignable to type 'ScoutingInfoTipo | undefined'.
10:20:16.481 
  Type '"entorno"' is not assignable to type 'ScoutingInfoTipo | undefined'.
10:20:17.379 
 ELIFECYCLE  Command failed with exit code 2.
10:20:17.531 
Error: Command "pnpm run build" exited with 2
