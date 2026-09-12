# AI Assisted Apply Implementation Plan

## Goal
Build a true user-assisted AI apply flow where the agent controls browser steps for form navigation/fill, asks for user help only when needed (login/account/autofill/unknown answers), and never final-submits without explicit user confirmation.

## Product Behavior
1. User starts Assisted Apply from a job card.
2. Agent opens the source page (LinkedIn or direct ATS).
3. If LinkedIn, agent clicks Apply and follows handoff to Easy Apply modal or external ATS tab.
4. Agent fills known answers and runs iterative AI action planning on visible controls.
5. If blocked:
   - Login/account required -> agent asks user in chat and waits.
   - Resume-autofill available -> agent prompts user to trigger it.
   - Unknown required answers -> agent asks targeted field questions in chat.
6. Agent keeps posting progress events and periodic screenshots.
7. Agent stops before final submit and asks for human review/submit.
8. Login/account creation is always user-owned; agent pauses and waits for explicit continue.
9. Agent captures screenshots on phase transitions and every ~3 AI actions during execution.
10. Draft generation uses the active profile and the latest tailored resume for the target job when available.
11. Clarifications provided by the user are remembered per profile for future runs (safe short-answer fields only).

## Technical Design
### Backend
- `submission_engine.py`
  - Add explicit phases (`navigate`, `linkedin_handoff`, `waiting_user`, `filling`, `ai_operating`, `review`, `submitting`).
  - Add user-action gate states (`login_required`, `account_creation_required`, `resume_autofill_recommended`, `clarification_required`, `final_review`).
  - Add clarification parser (`Field: value` or JSON object) to resolve missing required placeholders.
  - Add LinkedIn apply-handoff helper to click Apply and switch to external tab when needed.
  - Add required-field detector and wait loop for manual intervention when fields remain empty.
  - Add richer AI action support (`click_link`) and include site playbook hints in planning prompt.
- `apply_playbook.py` (new)
  - Persist per-site markdown notes in `backend/data/apply_playbooks/<domain>.md`.
  - Feed notes back into future AI planning prompts.
- `drafts.py`
  - Add `POST /drafts/{id}/mark-submitted` for visible-browser manual submit confirmation.

### Frontend
- `JobFeedPage.tsx`
  - Surface phase + user-action-needed banner in running modal.
  - Keep Browser/Agent/Chat tabs.
  - Review modal supports manual submit confirmation (`I Submitted in Browser`) in visible mode.
- `packages/api/src/drafts.ts`
  - Parse new progress fields (`phase`, `waiting_for_user`, `required_user_action`, `snapshots`).
  - Add `markAssistedSubmitted()`.

## Safety/Control Rules
- Never auto-submit unless explicit final submit API is called.
- In visible mode, login/account flow is always user-owned.
- In managed mode, login/account blockers return actionable errors.
- User chat guidance can stop the run (`stop|cancel|abort`).
- Memory writes are confidence-gated and only persisted at the end of successful runs.

## Rollout Plan
1. Ship backend phase/gate framework + chat clarification loop.
2. Ship LinkedIn apply handoff + playbook memory.
3. Ship frontend state rendering + manual-submit confirmation path.
4. Add follow-up tests for gate detection and clarification parsing.
