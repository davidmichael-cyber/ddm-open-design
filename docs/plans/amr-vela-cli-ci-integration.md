# AMR Vela CLI CI Integration Review

## Summary

This change wires Open Design's beta mac arm64 packaging path to Vela's npm-owned CLI distribution contract.

The release policy is intentionally narrow:

- Beta mac arm64 release builds require a bundled Vela CLI.
- Windows, Linux, mac Intel, preview, and stable builds remain non-strict in this rollout.
- Open Design depends on `@powerformer/vela-cli` only; it does not depend directly on platform-specific packages such as `@powerformer/vela-cli-darwin-arm64`.
- Vela owns the package distribution contract and platform resolver behavior.

## Problem

The AMR runtime needs the `vela` binary in packaged Open Design builds. Before this change, Open Design could only bundle Vela when `OPEN_DESIGN_VELA_CLI_BIN` pointed at a local binary. That is useful for development, but it does not give CI a stable release contract.

For beta mac arm64 release builds, silently shipping without Vela would make the packaged AMR runtime look present but fail at runtime. For other platforms, failing packaging would be too disruptive because Vela platform coverage is intentionally being rolled out in phases.

## Design

### Distribution Boundary

Open Design treats `@powerformer/vela-cli` as the only packaging dependency.

That package is expected to expose:

```ts
resolveVelaCliBin({ strict?: boolean }): string | null | undefined | { path?: string | null; supported?: boolean }
```

The package may internally depend on platform-specific optional packages. Open Design does not encode those platform packages directly because that would duplicate Vela's distribution matrix in Open Design.

### Resolution Order

Vela binary resolution follows this order:

1. `OPEN_DESIGN_VELA_CLI_BIN`
2. Dynamic import of `@powerformer/vela-cli`
3. `resolveVelaCliBin({ strict })`

The environment override remains first so developers and emergency CI runs can point at an explicit binary without changing dependency resolution.

### Strict Versus Non-Strict Mode

Non-strict mode is the default. Missing package, unsupported platform, missing resolver, or null resolver result means "skip Vela bundling."

Strict mode is opt-in through `--require-vela-cli`. In strict mode, the build fails when the resolver cannot produce a binary path. Error messages mention both `@powerformer/vela-cli` and `OPEN_DESIGN_VELA_CLI_BIN` so the operator has both remediation paths.

### CI Policy

Only `.github/workflows/release-beta.yml`'s beta mac arm64 job passes `--require-vela-cli`.

The mac Intel, Windows, Linux, preview, and stable jobs do not pass the flag in this rollout. They keep existing behavior and skip Vela bundling when unsupported or unavailable.

## Implementation

### Dependency

`tools/pack/package.json` adds:

```json
"optionalDependencies": {
  "@powerformer/vela-cli": "0.0.1-test.0"
}
```

`pnpm-lock.yaml` records both `@powerformer/vela-cli@0.0.1-test.0` and its optional darwin arm64 package.

### CLI Configuration

`tools/pack/src/config.ts` adds `requireVelaCli` to the tool-pack configuration.

`tools/pack/src/index.ts` exposes:

```bash
--require-vela-cli
```

### Resource Copying

`tools/pack/src/resources.ts` now owns `resolveOptionalVelaCliBinary`.

The function:

- returns `OPEN_DESIGN_VELA_CLI_BIN` when set;
- dynamically imports `@powerformer/vela-cli`;
- calls `resolveVelaCliBin({ strict: requireBundled })`;
- returns `null` in non-strict skip cases;
- throws clear strict-mode errors when the binary is required but unavailable.

`copyOptionalVelaCliBinary` copies the resolved binary into:

```text
resources/open-design/bin/vela
```

and marks it executable on POSIX platforms.

### Mac Packaging

`tools/pack/src/mac/app.ts` passes `config.requireVelaCli` into Vela resource copying. That makes beta mac arm64 strict because the workflow passes `--require-vela-cli`.

### Windows Resource Cache

`tools/pack/src/win/resources.ts` uses `resolveOptionalVelaCliBinary()` in the resource cache key. This preserves cache correctness when a Vela binary is present while keeping Windows non-strict by default.

### Beta Workflow

`.github/workflows/release-beta.yml` adds `--require-vela-cli` only to `build_mac`:

```bash
pnpm exec tools-pack mac build \
  --namespace release-beta \
  --portable \
  --to dmg \
  --json \
  --require-vela-cli \
  --signed
```

No other release-beta platform job includes the flag.

## Tests

Focused `tools-pack` coverage was added for:

- config parsing of `requireVelaCli`;
- copying a fake env-provided Vela binary and preserving executable permissions;
- copying a fake npm-resolved Vela binary and preserving executable permissions;
- env override priority over npm resolver output;
- strict missing package failure;
- strict resolver-without-binary failure;
- non-strict unsupported platform skip;
- release-beta workflow placement of `--require-vela-cli`.

The workflow placement test asserts:

- beta mac arm64 contains `--require-vela-cli`;
- mac Intel does not contain it;
- Windows does not contain it;
- Linux does not contain it;
- the flag appears exactly once in `release-beta.yml`.

## Validation

Validated locally under Node `v24.0.0` and pnpm `10.33.2`.

Focused tests:

```bash
pnpm --dir tools/pack exec vitest run tests/resources.test.ts tests/release-workflows.test.ts tests/win-resources.test.ts tests/config.test.ts tests/linux.test.ts
```

Result:

```text
5 files passed
69 tests passed
```

Typecheck:

```bash
pnpm --filter @open-design/tools-pack typecheck
pnpm typecheck
```

Guard:

```bash
pnpm guard
```

Local non-publishing beta mac arm64 dry run:

```bash
pnpm exec tools-pack mac build \
  --dir .tmp/release-beta-dry-run \
  --namespace release-beta \
  --portable \
  --app-version 0.7.0-beta.0 \
  --mac-compression store \
  --to dmg \
  --json \
  --require-vela-cli
```

The dry run produced:

```text
.tmp/release-beta-dry-run/out/mac/namespaces/release-beta/dmg/Open Design-release-beta.dmg
```

The bundled Vela binary was verified at:

```text
.tmp/release-beta-dry-run/out/mac/namespaces/release-beta/resources/open-design/bin/vela
```

Verification result:

```text
- executable bit present
- Mach-O 64-bit executable arm64
```

## Review Notes

Reviewers should focus on these boundaries:

- `@powerformer/vela-cli` remains the only Vela npm dependency in Open Design.
- `OPEN_DESIGN_VELA_CLI_BIN` remains highest priority.
- Strict mode is opt-in and only used by beta mac arm64 CI.
- Non-strict mode must not fail unrelated platforms.
- Error messages in strict mode include both remediation paths: install `@powerformer/vela-cli` or set `OPEN_DESIGN_VELA_CLI_BIN`.
- Workflow coverage prevents accidental rollout of strict mode to other platforms.

## Known Limits

The local dry run did not exercise Apple signing, notarization, R2 upload, GitHub artifact upload, or release metadata publishing. Those require CI secrets and hosted runner context.

The first local dry run using `/tmp` exposed an existing path-shape issue caused by macOS resolving `/tmp` through `/private/tmp` in prebundle entrypoints. The successful dry run used the repository `.tmp` path, which matches normal project-local tools-pack usage more closely.

## Follow-Ups

After Vela's package version moves from `0.0.1-test.0` to a stable release tag, update `tools/pack/package.json` and `pnpm-lock.yaml`.

When Vela supports additional platforms, strict mode can be selectively enabled for those platform release jobs with matching smoke coverage.
