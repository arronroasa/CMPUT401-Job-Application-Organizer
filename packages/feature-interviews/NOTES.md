# Feature: Interviews
## Status: Scaffolded

## What's Done
- InterviewsPage with 4 tabs: Questions, Answer Drafts, Mock Simulator, Performance History
- QuestionsTab: grouped by category (technical/behavioral/company), difficulty badges, context notes
- AnswerDraftsTab: STAR format display (situation/task/action/result/reflection)
- MockSimulatorTab: sequential question flow, textarea input, stub scoring feedback
- PerformanceHistoryTab: Recharts LineChart for score history, session details list
- Zustand store with fetchKits, advanceQuestion, saveMockScore

## Next Steps
- Kit selector (currently auto-selects first kit)
- Wire Mock Simulator scoring to Gemini API
- Add audio recording option (browser MediaRecorder API)
- Add weakness strategy tab (from skill gap analysis)
- Persist mock sessions to backend

## Dependencies
- @onfile/core (InterviewKit, InterviewQuestion, AnswerDraft, MockScore)
- @onfile/ui (PageHeader)
- @onfile/api (getInterviewKits)
- recharts
