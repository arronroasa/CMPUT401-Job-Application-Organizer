# Feature: Jobs
## Status: Scaffolded

## What's Done
- JobFeedPage with SplitPane layout
- JobList with scrollable JobCard components
- JobCard shows company, title, match badge, status pill, missing skill count
- JobDetail shows description, required skills (have ✓ / missing ✗), optional skills, match breakdown bars
- Action buttons: Prepare Resume, Prepare Application, Mark Interested (stubs)
- Zustand store (useJobsStore) with fetchJobs, selectJob, markInterested

## Next Steps
- Wire "Prepare Resume" to navigate to /resume-studio?jobId=...
- Wire "Prepare Application" to create a draft and navigate to /applications
- Add filter/sort bar above job list (by match %, date, remote)
- Add search input to filter jobs by title or company
- Paginate or virtualize the list when job count grows

## Dependencies
- @onfile/core (Job, MatchTier, JobStatus)
- @onfile/ui (SplitPane, MatchBadge, StatusPill, PageHeader)
- @onfile/api (getJobs, markJobInterested)
