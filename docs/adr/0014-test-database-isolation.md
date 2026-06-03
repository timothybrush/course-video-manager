---
status: accepted
---

# Test database isolation: PGlite snapshot + a de-isolated test project for DB tests

The DB-backed test suite uses in-process **PGlite** (Postgres compiled to WASM), not a real Postgres server. Each test file builds its own schema in `beforeAll` and resets state with `truncateAllTables` in `beforeEach` (`app/test-utils/pglite.ts`). Two measured costs dominated the run, and neither was "spawning a database":

1. **Module loading.** With Vitest's default `isolate: true`, every test file re-imports the full app/Effect/drizzle module graph. On the full suite this `collect` step was ~51s of work — the single largest cost.
2. **Schema creation.** `drizzle-kit`'s `pushSchema` (introspect-empty-DB → diff → emit DDL) costs ~724ms and ran once per DB file (33×). Booting PGlite itself is ~1ms — the database is effectively free; rebuilding the schema 33 times is not.

We decided on two stacking changes:

- **Layer 1 — split the suite into two Vitest projects.** Files that `vi.mock`/`vi.stub*` a shared module (notably `vi.mock("node:fs")`) stay in an **isolated project** (`isolate: true`). Everything else — including all DB files — runs in a **shared project** (`isolate: false`), loading modules once per worker. Measured: full suite **27.7s → 13.4s (~2×)**.
- **Layer 2 — a PGlite schema snapshot.** A `globalSetup` builds the schema once, `dumpDataDir()`s it to a temp file, and `provide()`s the path; `createTestDb` loads it with `new PGlite({ loadDataDir })` instead of running `pushSchema`. Measured per-file DB setup **724ms → 263ms (~2.7×)**, stacking on top of Layer 1 for the de-isolated DB files.

## Why this shape

- **`isolate: false` is the big lever, but it is unsafe globally in this repo.** Under `--no-isolate --sequence.shuffle` the suite flaked: `vi.mock("node:fs")` leaks across files sharing a worker's module registry, so depending on file order another file gets a mocked `existsSync` (or the cloudinary file gets the real one). This is the classic isolate-false cross-file leak — it passes most runs and fails by order, the hardest flake to triage. The project split quarantines exactly the ~6 mocking files and keeps the win for the other ~119. The 35 DB files use no module mocks and were stable across 3 shuffled de-isolated runs.
- **The snapshot keeps us in-process.** PGlite boots in ~1ms; the waste was redoing `pushSchema`'s diff, not the database. `dumpDataDir`/`loadDataDir` clones the already-materialized bytes, so we pay the schema cost once total instead of 33 times — no Docker, no ports, no new dependency, and the existing `truncateAllTables` reset is unchanged.

## Considered alternatives

- **A single real Postgres on a port, schema namespaced per worker** (the originating issue's framing). One server started in `globalSetup`, a template DB built once, each worker (`VITEST_POOL_ID`) cloning it via `CREATE DATABASE … TEMPLATE`. Higher fidelity than WASM and the canonical Vitest+Postgres pattern, but it adds a Docker/native-binary dependency to dev and CI for a wall-time win the two in-process layers already deliver. Deferred, not rejected — the natural follow-up if we ever need real-Postgres fidelity. Note: the issue's literal "namespaced table names (Drizzle prefix)" is **not** the right knob — `pgTableCreator` fixes the prefix at import time, so you can't vary it per file; schema/database-per-worker is the idiomatic isolation unit.
- **Raw-DDL replay** (cache `pushSchema`'s statements once, re-execute per file). Skips the diff but not the DDL execution, which is most of the cost in WASM — measured only 724ms → 532ms. The snapshot dominates it.
- **`pg-mem`** (pure-JS Postgres emulation). Rejected: it emulates rather than runs Postgres, and the app leans on real Postgres behaviour; correctness risk outweighs any speed gain.
- **Transaction-rollback per test** instead of truncate. Faster reset in principle, but the Effect service layer (`DrizzleService`) opens its own transactions, so per-test isolation would require threading savepoints through the injected client. High complexity for a reset cost truncate already handles cheaply. Deferred.

## Consequences

- **New test files inherit a placement rule.** A test that `vi.mock`s or `vi.stub*`s a shared/core module must live in the isolated project; otherwise it can leak under `isolate: false` and, worse, silently corrupt unrelated files. This is a standing constraint reviewers must apply, and the failure mode is order-dependent flake, not a clean error.
- **`isolate: false` keeps module top-level state alive across files in a worker.** Any production singleton with mutable module-level state can now leak between test files in the shared project. The de-isolated set must stay "mostly pure" code; introducing shared mutable singletons there is a latent-flake risk.
- **The schema snapshot is built from `drizzle-kit`'s view of `@/db/schema`, once per run.** If a migration path ever diverges from `pushSchema`'s output, tests would run against the snapshot's schema, not the migrated one — the same fidelity caveat PGlite already carries, now centralised in `globalSetup`.
