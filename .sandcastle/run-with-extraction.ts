import {
  run,
  StructuredOutputError,
  type OutputObjectDefinition,
  type RunOptions,
  type RunResult,
} from "@ai-hero/sandcastle";

/**
 * Options for {@link runWithExtraction} — the standard `run()` options, but with
 * `output` separated out and an `extractionPrompt` added.
 *
 * The `output` definition is NOT applied to the produce run (see the module
 * docs); it is applied to the extraction run(s) instead.
 */
export interface RunWithExtractionOptions<T> extends Omit<
  RunOptions,
  "output"
> {
  /** Structured output to extract during the extraction pass. */
  readonly output: OutputObjectDefinition<T>;
  /**
   * Prompt for the extraction pass, sent after resuming the produce session.
   * Must contain the configured opening tag literal (e.g. `<output>`), since
   * Sandcastle requires the resolved prompt to contain it.
   */
  readonly extractionPrompt: string;
  /** Maximum number of extraction attempts before giving up. Default: 3. */
  readonly maxAttempts?: number;
}

/**
 * Run an agent in two phases to make structured output reliable.
 *
 * The brittle part of structured output is asking the agent to both *do the
 * work* and *emit rigid JSON* in a single turn — it frequently returns
 * malformed JSON or omits the `<output>` tag, and a single failure aborts the
 * whole run. This wrapper splits the two concerns:
 *
 * 1. **Produce.** Run the agent on `prompt`/`promptFile` with NO `output`
 *    definition, so `run()` never throws on extraction and we keep the
 *    resumable `sessionId`. The produce prompt should contain no JSON-emission
 *    instructions — it just does the work and reasons in prose.
 * 2. **Extract.** Resume that session with `extractionPrompt` and the `output`
 *    definition. This turn does nothing but transcribe what the agent already
 *    did into the schema. On `StructuredOutputError`, re-resume the *produce*
 *    session (its id is stable; a thrown extraction run hands back no id) and
 *    feed the previous attempt's raw output + validation error back into the
 *    prompt, up to `maxAttempts` times.
 *
 * Returns the produce run's result (commits, branch, stdout) with the
 * extraction run's `output` — extraction must not commit, so the produce
 * commits are the source of truth for callers that inspect `commits`.
 *
 * Throws the final {@link StructuredOutputError} if every attempt fails, which
 * mirrors the pre-wrapper failure path (the workflow marks the PR/issue
 * blocked).
 */
export async function runWithExtraction<T>(
  options: RunWithExtractionOptions<T>
): Promise<RunResult & { output: T }> {
  const {
    output,
    extractionPrompt,
    maxAttempts = 3,
    ...produceOptions
  } = options;

  const produce = await run(produceOptions);

  const sessionId = produce.iterations.at(-1)?.sessionId;
  if (!sessionId) {
    throw new Error(
      "runWithExtraction: produce run returned no sessionId, so the extraction " +
        "pass cannot resume it. Session capture must be enabled (Claude Code " +
        "provider with sessions written to the host)."
    );
  }

  let lastError: StructuredOutputError | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const prompt = lastError
      ? `${extractionPrompt}\n\n${buildRetryFeedback(lastError, attempt, maxAttempts)}`
      : extractionPrompt;

    try {
      const extraction = await run({
        ...produceOptions,
        name: produceOptions.name
          ? `${produceOptions.name} (extract)`
          : undefined,
        promptFile: undefined,
        prompt,
        resumeSession: sessionId,
        output,
      });
      return { ...produce, output: extraction.output };
    } catch (error) {
      if (error instanceof StructuredOutputError) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  throw lastError;
}

/**
 * Build the feedback block appended to the extraction prompt on a retry. It
 * shows the agent exactly what it emitted last time and why it failed
 * validation — the highest-leverage signal for getting valid output next time.
 */
function buildRetryFeedback(
  error: StructuredOutputError,
  attempt: number,
  maxAttempts: number
): string {
  const header = `## Previous attempt failed (now on attempt ${attempt} of ${maxAttempts})`;

  if (error.rawMatched === undefined) {
    return [
      header,
      "",
      `Your previous response did not contain a \`<${error.tag}>\` block at all.`,
      `Emit exactly one \`<${error.tag}>\` block as described above. Do not change any code.`,
    ].join("\n");
  }

  return [
    header,
    "",
    "This is what you emitted last time:",
    "```",
    error.rawMatched,
    "```",
    "",
    "It failed validation for this reason:",
    "```",
    describeCause(error.cause),
    "```",
    "",
    `Fix the problem and re-emit a single corrected \`<${error.tag}>\` block. Do not change any code — only the output.`,
  ].join("\n");
}

/** Render a StructuredOutputError `cause` (JSON parse error or schema issues) as readable text. */
function describeCause(cause: unknown): string {
  const issues = extractIssues(cause);
  if (issues) {
    return issues
      .map((issue) => {
        const path = issue.path
          ?.map((p) => (typeof p === "object" && p !== null ? p.key : p))
          .join(".");
        return path ? `- ${path}: ${issue.message}` : `- ${issue.message}`;
      })
      .join("\n");
  }
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

interface SchemaIssue {
  readonly message: string;
  readonly path?: ReadonlyArray<PropertyKey | { key: PropertyKey }>;
}

/** Pull Standard Schema issues out of a cause, whether it's an array or `{ issues }`. */
function extractIssues(cause: unknown): readonly SchemaIssue[] | undefined {
  if (Array.isArray(cause)) return cause as SchemaIssue[];
  if (
    typeof cause === "object" &&
    cause !== null &&
    "issues" in cause &&
    Array.isArray((cause as { issues: unknown }).issues)
  ) {
    return (cause as { issues: SchemaIssue[] }).issues;
  }
  return undefined;
}
