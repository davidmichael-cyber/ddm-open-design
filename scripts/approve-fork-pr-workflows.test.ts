import assert from "node:assert/strict";
import test from "node:test";

import {
  hasPullApprovalStateDrift,
  isDeniedChangedPath,
  isPendingApprovalRun,
  runTargetsPullRequest,
  waitForPendingApprovalRuns,
} from "./approve-fork-pr-workflows.ts";

test("isPendingApprovalRun matches approval-gated fork PR runs from GitHub's captured payload shape", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const run = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/ci.yml@main",
    pull_requests: [],
  };

  assert.equal(isPendingApprovalRun(run, pull), true);
});

test("isPendingApprovalRun rejects runs outside the allowlist or without action_required conclusion", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  assert.equal(
    isPendingApprovalRun(
      {
        id: 26273463769,
        name: "CI",
        event: "pull_request",
        status: "completed",
        conclusion: "success",
        head_sha: "734076155c44e569304856590019cea54506fdab",
        path: ".github/workflows/ci.yml@main",
        pull_requests: [],
      },
      pull,
    ),
    false,
  );

  assert.equal(
    isPendingApprovalRun(
      {
        id: 26273463770,
        name: "Visual PR Comment",
        event: "pull_request",
        status: "completed",
        conclusion: "action_required",
        head_sha: "734076155c44e569304856590019cea54506fdab",
        path: ".github/workflows/visual-pr-comment.yml@main",
        pull_requests: [],
      },
      pull,
    ),
    false,
  );
});

test("runTargetsPullRequest accepts empty run.pull_requests only when the head SHA maps to this one open PR", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const run = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/ci.yml@main",
    pull_requests: [],
  };

  assert.equal(runTargetsPullRequest(run, pull, [pull]), true);
});

test("runTargetsPullRequest rejects ambiguous empty run.pull_requests associations", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const otherPull = {
    ...pull,
    number: 3001,
    base: {
      ref: "release",
      sha: "8db117d728f967d108f6fdd64cb8d921d057f7f6",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const run = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/ci.yml@main",
    pull_requests: [],
  };

  assert.equal(runTargetsPullRequest(run, pull, [pull, otherPull]), false);
});

test("runTargetsPullRequest rejects runs that GitHub already associates to a different PR", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const run = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/ci.yml@main",
    pull_requests: [
      {
        number: 3001,
        head: pull.head,
        base: {
          ref: "release",
          sha: "8db117d728f967d108f6fdd64cb8d921d057f7f6",
          repo: { full_name: "nexu-io/open-design" },
        },
      },
    ],
  };

  assert.equal(runTargetsPullRequest(run, pull, [pull]), false);
});

test("runTargetsPullRequest approves only the run that GitHub associates to the current PR when two PRs share a head SHA", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const otherPull = {
    ...pull,
    number: 3001,
    base: {
      ref: "release",
      sha: "8db117d728f967d108f6fdd64cb8d921d057f7f6",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  const currentPrRun = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: pull.head.sha,
    path: ".github/workflows/ci.yml@main",
    pull_requests: [pull],
  };

  const otherPrRun = {
    ...currentPrRun,
    id: 26273463770,
    pull_requests: [otherPull],
  };

  assert.equal(runTargetsPullRequest(currentPrRun, pull, [pull, otherPull]), true);
  assert.equal(runTargetsPullRequest(otherPrRun, pull, [pull, otherPull]), false);
});

test("hasPullApprovalStateDrift stays false only while the PR remains open on the same head/base tuple", () => {
  const pull = {
    number: 2683,
    state: "open",
    changed_files: 1,
    head: {
      sha: "734076155c44e569304856590019cea54506fdab",
      repo: { full_name: "someone/open-design" },
    },
    base: {
      ref: "main",
      sha: "4cd93a5c7a7b0db1961c854e55f8e0e6b1b45542",
      repo: { full_name: "nexu-io/open-design" },
    },
  };

  assert.equal(hasPullApprovalStateDrift(pull, pull), false);
  assert.equal(hasPullApprovalStateDrift(pull, { ...pull, draft: true }), true);
  assert.equal(hasPullApprovalStateDrift(pull, { ...pull, state: "closed" }), true);
  assert.equal(
    hasPullApprovalStateDrift(pull, {
      ...pull,
      head: { ...pull.head, sha: "08a88a65482123629ebda5a090c71533bd6b8a88" },
    }),
    true,
  );
  assert.equal(
    hasPullApprovalStateDrift(pull, {
      ...pull,
      base: { ...pull.base, ref: "release" },
    }),
    true,
  );
});

test("isDeniedChangedPath blocks common tool config files under allowlisted source trees", () => {
  assert.equal(isDeniedChangedPath("apps/web/vitest.config.ts"), true);
  assert.equal(isDeniedChangedPath("apps/web/vite.config.ts"), true);
  assert.equal(isDeniedChangedPath("apps/web/playwright.config.ts"), true);
  assert.equal(isDeniedChangedPath("apps/web/src/app/page.tsx"), false);
});

test("waitForPendingApprovalRuns retries until action_required runs appear and keeps polling through the retry window", async () => {
  const run = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/ci.yml@main",
    pull_requests: [],
  };

  const batches = [[], [], [run]];
  const sleeps: number[] = [];

  const pendingRuns = await waitForPendingApprovalRuns(
    async () => batches.shift() ?? [run],
    async (ms) => {
      sleeps.push(ms);
    },
  );

  assert.deepEqual(pendingRuns, [run]);
  assert.deepEqual(sleeps, [3000, 3000, 3000]);
});

test("waitForPendingApprovalRuns keeps polling and unions newly discovered runs across the retry window", async () => {
  const ciRun = {
    id: 26273463769,
    name: "CI",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/ci.yml@main",
    pull_requests: [],
  };
  const visualRun = {
    id: 26273463770,
    name: "Visual PR Verify",
    event: "pull_request",
    status: "completed",
    conclusion: "action_required",
    head_sha: "734076155c44e569304856590019cea54506fdab",
    path: ".github/workflows/visual-pr-verify.yml@main",
    pull_requests: [],
  };

  const batches = [[ciRun], [ciRun], [ciRun, visualRun], [ciRun, visualRun]];
  const sleeps: number[] = [];

  const pendingRuns = await waitForPendingApprovalRuns(
    async () => batches.shift() ?? [ciRun, visualRun],
    async (ms) => {
      sleeps.push(ms);
    },
  );

  assert.deepEqual(pendingRuns, [ciRun, visualRun]);
  assert.deepEqual(sleeps, [3000, 3000, 3000]);
});

test("waitForPendingApprovalRuns stops after the bounded retry budget", async () => {
  let calls = 0;
  const sleeps: number[] = [];

  const pendingRuns = await waitForPendingApprovalRuns(
    async () => {
      calls += 1;
      return [];
    },
    async (ms) => {
      sleeps.push(ms);
    },
  );

  assert.deepEqual(pendingRuns, []);
  assert.equal(calls, 4);
  assert.deepEqual(sleeps, [3000, 3000, 3000]);
});
