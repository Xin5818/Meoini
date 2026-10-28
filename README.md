# Meoini

A Finnish and English dictionary with flashcards, spaced review, pronunciation support, and offline access.

## Current status

Meoini is a browser-based single-page application. Flashcards and review data are stored locally in the browser. Supabase Auth optionally provides account registration, sign-in, sign-out, and session recovery. Cloud flashcard synchronization is not implemented yet.

## Features

- Search English and Finnish entries, with suggestions and spelling-tolerant matching.
- Save dictionary entries as flashcards, or import word lists from TXT and flashcards from CSV.
- TXT imports can query the dictionary in the background and save successful results locally.
- Review due cards with spaced repetition, or use early review without changing the SRS schedule.
- View Finnish pronunciation, available IPA and audio, and word-specific pronunciation tips.
- Install as a PWA and use the app shell and locally saved flashcards offline.

## Technology

- **React 19 + TypeScript** for the interface and application logic.
- **Vite** for local development and production builds.
- **Tailwind CSS v4** for styling.
- **React Router** for the four application pages.
- **Dexie + IndexedDB** for local flashcard storage.
- **vite-plugin-pwa + Workbox** for installation and offline caching.
- **Supabase Auth** for optional account authentication; no flashcard sync service is connected.

The browser application uses TypeScript/JavaScript. Python and C# are not part of the current runtime or build stack.

## Application architecture

```text
src/
├── app/                  # App shell and routes
├── components/           # Shared UI components
├── db/                   # Dexie database and IndexedDB operations
├── features/
│   ├── auth/             # Optional Supabase Auth
│   ├── dictionary/       # Providers, search, parsing, and pronunciation
│   ├── flashcards/       # Search, library, review, and SRS logic
│   ├── import-export/    # TXT/CSV parsing and persistence
│   └── settings/         # Preferences and settings page
├── hooks/                # Reusable React hooks
├── types/                # Shared TypeScript types
└── utils/                # Shared utilities
```

### Main routes and data flow

- `/` — dictionary search and save-to-flashcard flow.
- `/review` — review plan, due review, and early practice.
- `/library` — local flashcard library and lookup status.
- `/settings` — language preference, account, and import/export.

Dictionary results are parsed by providers and converted to the app's `DictionaryEntry` and `Flashcard` types. Flashcards are saved in IndexedDB through Dexie. Scheduled reviews update the local card's review schedule. Early practice records practice metadata while preserving `dueAt`, `intervalDays`, and `repetitions`.

## Dictionary sources

- **English (`en`)**: Free Dictionary API, with Wiktionary as a fallback.
- **Finnish (`fi`)**: Wiktionary.
- Dictionary results and suggestions usually require network access, unless a response is available from the browser cache. Saved flashcards remain available offline.

## Supabase Auth configuration

Authentication is optional. Copy `.env.example` to `.env.local` and provide:

```dotenv
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

For GitHub Pages deployment, configure the same values as GitHub Actions secrets. Never expose a Supabase `service_role` key in a browser build. See [SUPABASE_AUTH_SETUP.md](./SUPABASE_AUTH_SETUP.md) for redirect URL setup.

## Local development

Use Node.js 24, matching the GitHub Actions build environment.

```bash
npm ci
npm run dev
```

Available commands:

```bash
npm test        # Run tests
npm run lint    # Run Oxlint
npm run build   # Type-check and create the production build
npm run preview # Preview dist/ locally
```

## Deployment

Vite is configured with the GitHub Pages project base `/meoini/`. The GitHub Actions workflow builds the app and deploys the `dist/` directory when changes are pushed to `main` or `master`.

## Key files

- `src/app/routes.tsx` — route definitions.
- `src/features/dictionary/dictionaryService.ts` — supported languages and provider chains.
- `src/db/database.ts` — Dexie schema and flashcard persistence.
- `src/features/flashcards/review.ts` and `reviewPlan.ts` — scheduled review and early-practice rules.
- `src/features/import-export/` — TXT/CSV import and export.
- `vite.config.ts` — Vite base path and PWA configuration.
