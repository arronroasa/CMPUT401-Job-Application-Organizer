# Context

Glossary for OnFile, a job application organizer. (Formerly "TrackWise"; also seen as "Lodestar" in some design-tool exports — the product name is **OnFile**, tagline "your job search, organized".) Terms only, no implementation detail.

## Master resume

The single source-of-truth resume. One per user. Holds a summary, experience, projects, and a list of skills. The user edits it directly. It is never tied to a specific job.

## Tailored resume

A resume aimed at one specific job application. Created as a **snapshot copy** of the master at the moment of creation, then edited freely on its own. It carries the same fields as the master plus a name, an optional link to an application, and the job description it targets.

## Snapshot copy (master to tailored)

The relationship between the master and a tailored resume is a one-time copy, not a live link. Creating a tailored resume copies the master's fields into it. Later edits to the master do **not** flow into existing tailored resumes, and a tailored resume does not track how it has drifted from the master. This is a deliberate choice, not a gap.

## AI tailoring

Generating suggested edits for a tailored resume from a pasted **job description** using an external model (Gemini). Suggestions come back per section (summary, experience, projects, skills), and the user accepts or dismisses each one. Accepting fills that field in the editor; nothing is saved until the user saves. It is an assist on top of manual editing, never a replacement for it.

## Application

A job the user has applied to. Records company, role, date applied, stage, and communications. May link to one tailored resume via a resume reference.

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
