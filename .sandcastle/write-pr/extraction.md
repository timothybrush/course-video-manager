# EMIT STRUCTURED OUTPUT

Based on the work you just summarised, emit a single block as the last thing in your response:

<output>
{
  "prTitle": "feat: short imperative summary",
  "prDescription": "## Summary\n\n- bullet 1\n- bullet 2\n\nCloses #{{ISSUE_NUMBER}}"
}
</output>

- `prTitle` must be a single line, under 70 characters, conventional-commit style (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- `prDescription` must include `Closes #{{ISSUE_NUMBER}}` so the PR closes the issue on merge.
