# TASK

You are breaking a PRD into a flat list of native GitHub sub-issues. You do
**not** create the issues yourself. You emit a structured plan; the wrapping
script creates and attaches the sub-issues deterministically.

- **PRD:** #{{PRD_NUMBER}} — {{PRD_TITLE}}

# CONTEXT

1. Fetch the PRD:

   ```
   gh issue view {{PRD_NUMBER}} --comments
   ```

   Read it carefully. The PRD is the spec — do not add scope, do not
   redesign. If the PRD is ambiguous, make the most reasonable
   interpretation and proceed; do not stop to ask.

2. Read `CONTEXT.md` and skim `docs/adr/` for any decisions that bear on
   the area the PRD touches. Sub-issue titles and bodies must use the
   project's vocabulary.

3. Optionally explore the codebase to ground the breakdown in the real
   shape of the files you'll be cutting through.

# DRAFTING SUB-ISSUES

Break the PRD into **tracer-bullet** vertical slices. Each slice is a thin
vertical cut through every layer (schema → API → UI → tests), NOT a
horizontal slice of one layer.

Rules:

- Each slice delivers a narrow but COMPLETE path through every layer.
- A completed slice is demoable or verifiable on its own.
- Prefer many thin slices over few thick ones.
- Sub-issues are **flat** — a sub-issue must not itself need sub-issues.
  If a slice is too big to leaf, split it into multiple peer slices.
- Sub-issues run in **list order** under the PRD. Order them so
  dependencies are satisfied: if slice B builds on slice A's schema, A
  must come first.
- Each slice must stand on its own in a single agent session. A reasonable
  session can build a couple of files, write tests, and run
  typecheck/test. Don't draft slices that are unrealistic for one session.

Draft the ordered list of slices, each with a title, what to build, and
acceptance criteria.
