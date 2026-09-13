# Resume versions are a flat list with a master designation

There is no master resume entity. Resumes are one flat list of peer versions, and a
top-level `masterResumeId` names the version that acts as master.

Before this, a single `masterResume` sat beside a list of `tailoredResumes`, each
tailored resume carrying an `applicationId` back to the one application it was made
for. That back-pointer was already wrong in the seed data: two applications pointed
at `res-northwind`, while `res-northwind.applicationId` named only one of them. A
resume can be sent to several jobs, so the one-to-one link could not hold.

## Considered options

Keeping the master as its own entity and rendering it as a card alongside the
tailored ones. Rejected because it leaves two kinds of resume in the model to
justify a distinction the user never sees, and it keeps the back-pointer that was
already inconsistent.

## Consequences

An application names a version through `resumeVersionId`, and the link runs only in
that direction. Deleting a version clears that field on every application naming it.
Holding `masterResumeId` at the top level rather than a boolean on each version
makes two masters, or none, impossible to represent. The version holding the
designation cannot be deleted until the user moves it.
