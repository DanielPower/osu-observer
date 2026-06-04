# Observer — Agent Instructions

## Project Structure

pnpm monorepo with two workspaces:

- `app/` — TanStack Start (React + Nitro SSR) application
- `packages/osu-renderer/` — browser-side osu! renderer (canvas/WebGL)
- `packages/osu-simulation/` — osu! replay simulation logic

## Commands

```bash
pnpm dev          # build packages, then watch all in parallel
pnpm build        # production build (app only)
pnpm lint         # oxlint (run after every code change)
pnpm lint:fix     # auto-fix lint errors
pnpm typecheck    # tsc --noEmit across all packages
pnpm format       # oxfmt check
pnpm format:fix   # oxfmt apply
pnpm check        # lint + typecheck + format in parallel
pnpm test         # vitest
```

Always use `pnpm`, never `npm` or `yarn`.

## After Every Code Change

Run `pnpm lint` and fix all errors before finishing. The linter is oxlint — config is in `.oxlintrc.json`.

## TypeScript & React

- React Compiler is enabled. **Do not add `useMemo`, `useCallback`, or `memo`** — the compiler handles memoization automatically.
- Strict TypeScript throughout. No `any` unless unavoidable and clearly justified.
- All packages use `"moduleResolution": "bundler"`.

## Workspace Packages

`packages/osu-renderer` and `packages/osu-simulation` are compiled with `tsdown` and their `dist/` output is what the app imports. When changing a package:

1. Run `pnpm --filter <package-name> build` to update dist, or
2. Use `pnpm dev` from the root which watches all packages automatically.

Do not rely on the `"source"` export condition at runtime — it is not configured in Vite.

## Audio & Browser Events

Use `useEffect + useState` to subscribe to `HTMLAudioElement` events. Do **not** use `useSyncExternalStore` with `makeAudioSubscribe`-style helpers that accept rest args — rest parameters prevent React Compiler from memoising the subscribe function, causing Safari-specific infinite render loops.

## Zip Extraction

Use `@zip.js/zip.js` for all zip operations:

- Browser context: `BlobReader` / `BlobWriter`
- Node.js context: `Uint8ArrayReader` / `Uint8ArrayWriter`

## Database & Server

- Drizzle ORM with PostgreSQL (`postgres` driver)
- Schema in `app/src/db/schema.ts`
- Migrations: `pnpm db:generate` then `pnpm db:migrate`
- Server routes live under `app/src/server/` and `app/src/routes/api/`

## Code Style

- No comments unless the _why_ is non-obvious (hidden constraint, workaround, subtle invariant)
- No docstrings or multi-line comment blocks
- Formatter is oxfmt — run `pnpm format:fix` to apply
