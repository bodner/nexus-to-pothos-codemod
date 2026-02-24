# Nexus -> Pothos Codemod Iteration Template

Use this document as the team playbook for adapting this codemod to your codebase caveats.

## 0) One-time setup

- Baseline this repo:

  ```bash
  pnpm install
  pnpm test
  ```

- In the target application repo, prepare two schema snapshots:
  - `schema-before.graphql`
  - `schema-after.graphql`

- Define manual-review critical areas up front:
  - `authScopes`/authorization behavior
  - relay connection fields (`nodes`, `additionalArgs`, nullability)
  - lists/nullability and complex/computed fields

## 1) Iteration lifecycle (repeat for every caveat)

### Step A — Capture one caveat as a fixture

1. Create a minimal failing input fixture in `__testfixtures__/`.
2. Create expected output fixture in `__testfixtures__/`.
3. Use naming that encodes caveat + scenario, for example:
   - `connection_authscope_args.input.ts`
   - `connection_authscope_args.output.ts`

### Step B — Wire fixture into test suite

Add one `defineTest(...)` block in `__tests__/transform-test.ts` for the new fixture.

Run tests:

```bash
pnpm test
```

Optional fast loop while debugging:

```bash
pnpm test -- --runInBand --testPathPattern=transform-test.ts
```

### Step C — Implement minimal transform change

Edit `transform.ts` only for the targeted caveat. Keep changes narrow (one pattern family per PR).

Re-run tests:

```bash
pnpm test
```

### Step D — Trial run on real app slice

Run codemod on a small representative path first (not whole repo):

```bash
node ./node_modules/.bin/jscodeshift -t ./transform.ts "src/domainA/**/*.ts" --ignore-pattern="**/node_modules/**" --parser=ts --extensions=ts
```

Or through this repo CLI wrapper:

```bash
node ./bin/index.js "src/domainA/**/*.ts" --ignore-pattern="**/node_modules/**"
```

Preview only (no write) when needed:

```bash
node ./node_modules/.bin/jscodeshift -t ./transform.ts "src/domainA/**/*.ts" --ignore-pattern="**/node_modules/**" --parser=ts --extensions=ts --dry --print
```

### Step E — Validate behavioral parity

1. Type-check/build target app.
2. Generate `schema-after.graphql`.
3. Diff `schema-before.graphql` vs `schema-after.graphql`.
4. Manually inspect critical areas even if schema diff is empty.

## 2) Ring rollout plan

- Ring 1: 20–50 files, mixed patterns, one domain.
- Ring 2: one full domain/service.
- Ring 3: full codebase.

Gate to move to next ring:

- Fixture tests pass (`pnpm test` in codemod repo).
- Target app compiles.
- Schema diff reviewed and accepted.
- Manual critical checks completed.

## 3) Caveat ledger template

Track in issue/Notion/markdown table:

| Caveat ID | Nexus Pattern | Expected Pothos Pattern | Fixture Name | Status | Manual Follow-up |
|---|---|---|---|---|---|
| C-001 | `connectionField` with `authorize` | `t.connection` + `authScopes` | `connection_authscope_args` | In progress | verify nested auth |
| C-002 | computed object fields loop | unsupported | `computed_fields_loop` | Known unsupported | manual rewrite |

Status values:

- `In progress`
- `Supported`
- `Known unsupported`
- `Needs manual migration`

## 4) PR template (codemod changes)

Copy into each codemod PR description:

```md
## Scope
- Caveat(s):
- Pattern family:
- Out of scope:

## Fixtures
- Added input/output fixtures:
- Added/updated tests in __tests__/transform-test.ts:

## Validation
- [ ] `pnpm test` passes in codemod repo
- [ ] Trial run completed on Ring N target path
- [ ] Target app type-check/build passes
- [ ] Schema diff reviewed
- [ ] Manual auth/relay checks completed

## Manual follow-ups
- TODO(pothos-migration):
```

## 5) Weekly operating cadence (suggested)

- 2–4 caveat PRs/week (small, pattern-focused).
- 1 larger ring trial/week.
- 1 schema parity review/week with GraphQL owners.

## 6) Stop conditions / rollback

Stop and split scope when any of these happens:

- A transform change requires multiple unrelated pattern edits.
- Schema diff contains unresolved auth or relay behavior changes.
- Large volume of TODO/manual edits appears in one run.

Rollback rule:

- Revert that caveat PR only, keep other supported caveats moving.

## 7) Definition of done for one caveat

- Fixture exists and fails before fix.
- Transform change merged with minimal scope.
- Fixture suite passes.
- Trial slice run succeeds.
- Schema diff + manual critical checks accepted.
- Manual migration note documented (if applicable).