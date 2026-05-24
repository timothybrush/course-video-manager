# TASK

Write the title and description for a pull request that closes issue #{{ISSUE_NUMBER}}: {{ISSUE_TITLE}}.

The implementation is already done — commits sit on branch
`{{BRANCH}}`. You are NOT implementing anything. You are NOT running
tests. You are summarising work that already exists.

# CONTEXT

Read the issue:

```
gh issue view {{ISSUE_NUMBER}} --comments
```

Read what changed on the branch:

```
git log main..{{BRANCH}} --reverse
git diff main..{{BRANCH}} --stat
git diff main..{{BRANCH}}
```

If the diff is large, focus on the commit messages and the `--stat`
summary; only `git diff` specific files when a commit message is
unclear.

Draft the title and description from what you read.
