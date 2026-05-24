# EMIT STRUCTURED OUTPUT

Based on the PRD and sub-issues you just read, emit a single block as the last thing in your response:

<output>
{
  "prTitle": "feat: short imperative summary of the PRD as a whole",
  "prDescription": "## Summary\n\nWhat the PRD delivers, in 1–3 paragraphs framed around the whole effort.\n\n## Sub-issues\n\n- #N — title\n- #M — title\n\nCloses #{{PRD_NUMBER}}"
}
</output>

Rules:

- `prTitle` must be a single line, under 70 characters, conventional-commit style (`feat:`, `fix:`, `refactor:`, etc.), framed around the PRD as a whole.
- `prDescription` must:
  - describe the PRD's overall intent (restate the goal from the PRD body),
  - list every sub-issue with its number and title,
  - end with `Closes #{{PRD_NUMBER}}` so the PR auto-closes the PRD on merge.
