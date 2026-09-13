# The resume layout is written twice, on purpose

The Jake-format resume exists as two separate layouts: React and Tailwind for the
screen, and `@react-pdf/renderer` primitives for the downloaded PDF. They must be
kept in sync by hand.

This is deliberate. The alternative, `html2canvas` plus `jsPDF`, screenshots the
layout already on screen and needs only one layout, but it puts an image inside the
PDF. Applicant tracking systems extract no text from an image, and neither does
anything else. The app's own match check tells the user which keywords their resume
is missing, which only means anything if something downstream can read the text. A
resume that no parser can read would contradict the feature sitting next to it.

## Consequences

A change to the document's structure has to land in both layouts. Do not resolve
this duplication by moving to a screenshot-based PDF. If the duplication becomes
painful, extract the shared section order and field mapping rather than the
rendering.
