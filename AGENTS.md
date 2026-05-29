# AGENTS.md

## Build & Dev

- `npm run dev` — watch build with inline sourcemaps (for local development inside Obsidian)
- `npm run build` — typecheck (`tsc -noEmit -skipLibCheck`) then production build (no sourcemaps)
- `npm run version` — syncs the npm version into `manifest.json` and `versions.json`
- `main.js` is **gitignored** (build artifact); always build before testing

## CI

- `eslint.yml` runs on every push and uses **yarn** (not npm): `yarn run eslint . --ext .js,.jsx,.ts,.tsx`
- `release.yml` is manually triggered; builds with npm and creates a GitHub draft release bundling `main.js` + `manifest.json`

## Architecture

- **Obsidian plugin** — entry point: `src/main.ts` → esbuild bundles to `main.js` (CommonJS, `obsidian` and CodeMirror modules are externals)
- `manifest.json` is the Obsidian plugin manifest (`minAppVersion: 1.5.3`, plugin ID `foodiary`)
- `versions.json` maps each plugin version to its minimum Obsidian app version (auto-maintained by version-bump script)
- `src/types.ts` — domain types (`Product`, `NutritionalValue`, `Income`, `IncomeItem`, `LogLine`)
- `src/products.ts` — loads product data from markdown frontmatter in a configurable vault folder
- `src/settings.ts` — plugin settings tab + defaults
- `src/codeblocks/foodiary.ts` — the `foodiary` code block processor
- `styles.css` — plugin stylesheet (bundled with the plugin at root)

## Conventions

- **Tabs** for indentation (width 4), LF line endings, UTF-8 (see `.editorconfig`)
- ESLint disables: `no-unused-vars` / `@typescript-eslint/no-unused-vars` (args: none), `ban-ts-comment`, `no-prototype-builtins`, `no-empty-function`

## Key Dependencies

- `expr-eval` — used to evaluate math expressions in code block weight fields (e.g. `150+150`)
- `obsidian` (peer) — the Obsidian API, must remain an external in esbuild

## Code Block Format

```
\`\`\`foodiary
Apples 150+150  # comments with # or //
Donuts 85
\`\`\`
```

- Product names are matched case-insensitively against markdown filenames + their `aliases` frontmatter in the products folder
- Comments stripped before parsing; weight values evaluated as math expressions