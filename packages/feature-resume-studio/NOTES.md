# Feature: Resume Studio
## Status: Scaffolded

## What's Done
- SplitPane layout: VersionList (left) + ResumePreview/DiffView (right)
- VersionList renders base + tailored resume version cards with strength score
- ResumePreview renders resume fragments grouped by section (experience, project, achievement)
- Fragment hover shows "reason included" explainability tooltip
- DiffView shows two-column side-by-side placeholder comparison
- ExportButtons: working JSON download + PDF stub (logs to console)
- Compare mode toggle in page header

## Next Steps
- Implement real word-level diff (use diff-match-patch library)
- Wire PDF export to backend LaTeX renderer
- Add inline editing for resume fragments
- Drag-and-drop section reordering
- "Generate Tailored Version" button → calls resume engine

## Dependencies
- @onfile/core (ResumeVersion, ResumeFragment, ResumeType)
- @onfile/ui (SplitPane, PageHeader, cn)
- @onfile/api (getResumeVersions, exportResumeAsJson, exportResumeAsPdf)
