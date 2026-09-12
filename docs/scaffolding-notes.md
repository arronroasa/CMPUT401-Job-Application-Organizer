# OnFile — Project Root

## Status: Scaffolding complete

## What's Done
- pnpm workspace monorepo structure
- packages/core: all domain TypeScript interfaces + FeatureModule registry type
- packages/api: mock implementations with realistic seed data (120ms fake latency)
- packages/ui: shared shadcn/ui design system, dark-mode tokens, layout components
- packages/app: Vite + React 18 entry point, FeatureRegistry, createBrowserRouter, AppShell
- packages/feature-*: all 7 feature packages scaffolded with Zustand stores and page components
- backend/: FastAPI stub with /health endpoint
- Docker + docker-compose.yml for full containerization
- docs/team/: agent briefs for all 5 team members

## Architecture Decisions
- Features MUST NOT import from other feature packages
- Only allowed imports per feature: @onfile/ui, @onfile/core, @onfile/api
- FeatureModule shape: { navItem: NavItem, routes: RouteObject[] } — defined in packages/core
- Dark mode is DEFAULT — <html class="dark"> in index.html
- Zustand per-feature; persist middleware only for settings
- Mock API adds 120ms fake delay to simulate realistic latency

## Tech Stack
- React 18 + TypeScript + Vite
- shadcn/ui (neutral/slate, dark mode default)
- React Router v6
- Zustand
- Recharts (charts)
- @dnd-kit/core (Kanban drag-and-drop)
- Python + FastAPI (backend stub)
- Docker + Docker Compose

## Next Steps (Phase 2)
- Connect real FastAPI backend endpoints
- Implement actual resume generation pipeline (LaTeX + tectonic)
- Add Gemini API integration via settings API key
- Wire job discovery to real sources (RSS, public APIs)
- SQLite data layer via SQLAlchemy

## Conventions
- NOTES.md (not README.md) for all feature/package notes
- Conventional Commits: feat(), fix(), chore(), docs()
- File naming: PascalCase for components, camelCase for stores/utilities
- No barrel imports from feature packages into other features
- CSS: Tailwind classes only, never inline styles or hardcoded hex colors
