# The match score comes from Gemini, not from local keyword overlap

The match percentage and the missing keywords both come from a Gemini call over the
pasted job description. The app does not compute them locally.

A local computation, counting how many of the job description's terms appear in the
resume, needs no key and no network. It was rejected because it only matches literal
strings: a job asking for "component library work" scores zero against a resume that
says "design system", and the missing-keyword list fills with boilerplate the job
posting happened to repeat. A model reading both documents handles the paraphrase,
and it can also read the company and role out of the pasted text, which is what
labels the score.

## Consequences

The score needs `NEXT_PUBLIC_GEMINI_API_KEY`. Without one the match card shows an
empty state asking for a key rather than falling back to a local estimate, because
two scores computed different ways and shown the same way would not be comparable.

The result is stored on the version with its timestamp and only recomputed when the
user runs a new check. Without that, the same resume and the same job description
would produce a slightly different number on every page load.
