# Feature: Settings
## Status: Scaffolded

## What's Done
- SettingsPage with 4 sections: App Behavior, Resume Preferences, AI/LLM, Backup & Restore
- Zustand store with persist middleware (saves to localStorage as 'onfile-settings')
- App Behavior: daily cap number input, discovery interval select
- Resume Preferences: template select, export path input
- LLM: provider select, password key input with show/hide toggle, warning banner
- Backup/Restore: export stub, restore stub, reset confirmation dialog

## Next Steps
- Wire daily submission cap to backend scheduler
- LLM "Test Connection" → GET /api/health/llm with stored key
- Export Backup: serialize all Zustand store states to a single JSON file
- Restore: validate JSON structure before applying
- Add keyboard shortcuts hints panel

## Dependencies
- @onfile/core (no types needed — settings are local only)
- @onfile/ui (PageHeader, cn)
- zustand persist middleware
