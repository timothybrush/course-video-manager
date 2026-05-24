# TASK

Write the title and description for a pull request that delivers PRD #{{PRD_NUMBER}}: {{PRD_TITLE}}.

The PRD ships as a chain of sub-issue runs, all committing to the same
branch. This PR will be reused across every sub-issue run, so the
title and description must describe the **whole PRD**, not any
individual sub-issue. You are NOT implementing anything.

# CONTEXT

Read the PRD and its sub-issues:

```
gh issue view {{PRD_NUMBER}} --comments
gh api repos/$GH_REPO/issues/{{PRD_NUMBER}}/sub_issues
```

Draft the title and description, framed around the whole PRD.
