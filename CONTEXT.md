# Context

Glossary for OnFile, a job application organizer. (Formerly "TrackWise"; also seen as "Lodestar" in some design-tool exports — the product name is **OnFile**, tagline "your job search, organized".) Terms only, no implementation detail.

## Resume version

One named resume the user keeps, such as "Frontend — 2026". The user keeps several, and they are peers. No version is a draft of another. A version holds education, experience, projects, and technical skills, and renders as one document in the Jake format. It has no summary section, and it holds no link back to any application.

The backend has a `resume_versions` table of the same name and nearly the same idea, carrying a job reference and three separate score columns. It is unused, inherited from the careersavers reference project, and it is not this term. A resume version lives in the browser only.

## Contact header

The name, phone, email, LinkedIn, and GitHub at the top of every resume version. Held once for the user and shared by every version, because contact details are not something the user tailors for a job.

Distinct from the backend **profile** that Auto Search and Apply builds from an uploaded resume. The two words are not interchangeable.

## Master resume

A designation one version holds, not a document of its own. The version holding it is preselected when an application records which resume it was sent with, is what a new version copies from, and is the version the Resumes page opens on.

Exactly one version holds the designation at a time. The user can move it to another version, and a version cannot be deleted while it holds the designation.

## Snapshot copy

Creating a version copies the master's content at that moment. The copy is one-time, not a live link. Later edits to the master do not reach existing versions, and a version does not track how far it has drifted from the master. This is a deliberate choice, not a gap.

## Where it's been sent

The applications that name a version as the resume they were sent with. Many applications can name the same version. The link runs one way, from the application to the version, so a version never points back at an application. Deleting a version clears that reference on every application naming it.

## Match check

A reading of one version against a job description the user pastes in, produced by an external model (Gemini). It returns a percentage, the keywords the job asks for that the version lacks, and the company and role read out of the pasted text.

The user runs a match check on demand, and the result stays with the version until the next run, so the number never changes on its own. A version holds at most one, and pasting a new job description replaces the previous one.

## Missing keyword

A term a job description asks for that the version does not contain. Missing keywords come out of a match check, and they are what **AI tailoring** works from.

## AI tailoring

Rewriting a version's sections to cover the missing keywords its match check found, working from the same job description. Suggestions come back per section, and the user accepts or dismisses each one. Accepting fills that field in the editor, and nothing is saved until the user saves.

Tailoring rephrases and reorders only. It never invents employers, dates, degrees, or projects. It is an assist on top of manual editing, never a replacement for it.

## Resume import

Filling a version's fields from the one resume already on file for **Auto Search and Apply**. There is a single resume upload in the app. Importing reshapes that backend profile's education, experience, projects, and skills into the version's fields and offers them back as a **review**, where the user accepts or dismisses each section. Accepting only fills the editor, so nothing reaches the version until the user saves.

## Application

A job the user has applied to. Records company, role, date applied, stage, and communications. May name one resume version as the resume it was sent with.

## Next action

The one dated piece of work the user still owes an application, such as "Prep for panel interview" on the 15th. An application has at most one at a time, and it is either outstanding or done. It looks forward: it says what has not happened yet.

## Timeline entry

A record that an application arrived at a stage on a date. Entries accumulate, so an application that slid back and forward again carries the arrival twice. It looks backward: it says what already happened.

A next action and a timeline entry are both dated, and they are not interchangeable. Anything showing the days ahead reads next actions. Anything showing history, including notifications, reads timeline entries.

## Notification

News that one application reached a stage worth knowing about. A notification exists for each time an application arrives at **interview** or **offer**. Moving an application backward produces nothing. An application that returns to a stage it held before produces a second notification, because each arrival is separate news.

Notifications are a reading of an application's own history, not records kept beside it. Nothing is written when a move happens, and the list is worked out from the moves each application already carries. One consequence follows: deleting an application takes its notifications with it, leaving no trace. This is a deliberate choice, not a gap.

## Unread

A notification is unread until the user has looked at it. Opening the notifications page marks everything listed at that moment as read. The unread count is how many notifications the user has not yet looked at.

## Interview prep

A standalone page for interview preparation. The user searches a company and sees the LeetCode questions that company asks, ranked by frequency. Read-only, backed by a vendored public dataset. Separate from the user's own application data.

## Frequency (ask count)

For a company-question pair, the reported number of times that question came up at that company over the last six months, per the source dataset. Used to rank a company's questions most-asked first. It is a reported metric, not a literal count the user recorded.

## Company question set

The list of LeetCode questions associated with one company, each with its difficulty, patterns, and frequency. Derived at load time by indexing the question-centric dataset by company.
