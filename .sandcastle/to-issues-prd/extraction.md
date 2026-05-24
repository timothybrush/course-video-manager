# EMIT STRUCTURED OUTPUT

Emit the breakdown you just drafted as a single `<output>` block — the last thing in your response. The script parses it with a strict schema.

<output>
{
  "slices": [
    {
      "title": "short imperative title",
      "whatToBuild": "One to three short paragraphs describing this slice's end-to-end behavior, framed around what it delivers. No file paths. Plain text — embed newlines literally as \\n in the JSON.",
      "acceptanceCriteria": [
        "Concrete, checkable outcome 1",
        "Concrete, checkable outcome 2",
        "Tests cover the new behavior"
      ]
    }
  ]
}
</output>

Field rules:

- `slices` — ordered array. List order is execution order; the script
  attaches them in this order under the PRD. A later slice may build on
  any earlier slice's work; the ordering is the only signal of phase.
- `title` — short, imperative. No leading `feat:` / `fix:` prefix.
- `whatToBuild` — prose, not a list. Avoid specific file paths or code
  snippets. Exception: a prototype-derived snippet (state machine,
  reducer, schema, type shape) may be inlined when prose can't encode the
  decision as precisely.
- `acceptanceCriteria` — array of strings. The script renders them as a
  GitHub checklist (`- [ ] ...`). Always include one item that asserts
  tests cover the new behavior.

Do NOT include a `Closes` directive anywhere in the body — the script
omits one by design. Closing sub-issues is the implement-prd workflow's
job; closing the PRD is the merged PR's job.
