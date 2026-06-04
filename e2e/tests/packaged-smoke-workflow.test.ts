import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const e2eRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = dirname(e2eRoot);
const ciWorkflowPath = join(workspaceRoot, ".github", "workflows", "ci.yml");
const releaseBetaWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta.yml");
const releaseBetaSelfHostedWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-beta-s.yml");
const releasePreviewWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-preview.yml");
const releaseStableWorkflowPath = join(workspaceRoot, ".github", "workflows", "release-stable.yml");
const releaseStableScriptPath = join(workspaceRoot, "scripts", "release-stable.ts");
const releaseMacAssetsScriptPath = join(workspaceRoot, ".github", "scripts", "release", "assets", "mac.sh");
const releasePublishBetaCommonScriptPath = join(
  workspaceRoot,
  ".github",
  "scripts",
  "release",
  "publish-beta-common.ps1",
);
const releaseWinReportScriptPath = join(workspaceRoot, ".github", "scripts", "release", "report", "win.ps1");

describe("packaged smoke workflow", () => {
  it("keeps packaged smoke outside the main CI gate", async () => {
    const workflow = await readFile(ciWorkflowPath, "utf8");
    expect(workflow).not.toContain("packaged_smoke_");
    expect(workflow).not.toContain("Build PR mac artifacts");
    expect(workflow).not.toContain("Build PR windows artifacts");
    expect(workflow).not.toContain("Build PR linux headless artifacts");
    expect(workflow).not.toContain("Smoke PR mac packaged runtime");
    expect(workflow).not.toContain("Smoke PR windows packaged runtime");
    expect(workflow).not.toContain("Smoke PR linux headless packaged runtime");
    expect(workflow).not.toContain("OD_PACKAGED_E2E_");
    expect(workflow).not.toContain("actions/cache/save");
  });

  it("preserves beta linux AppImage smoke reports for platform publication", async () => {
    const workflow = await readFile(releaseBetaWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(
      /- name: Build beta linux artifacts\n(?:.+\n)+?(?=\n      - name: Smoke beta linux AppImage runtime)/m,
    );
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain(
      'node -e \'const fs = require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));\' "$build_json_path"',
    );
    expect(workflow).toContain("Smoke beta linux AppImage runtime");
    expect(workflow).toContain("manifest.json");
    expect(workflow).toContain("tools-pack.json");
    expect(workflow).toContain("Upload linux e2e spec report");
    expect(workflow).toContain("open-design-beta-linux-e2e-report");
    expect(workflow).toContain("Publish beta linux assets to R2");
    expect(workflow).toContain("RELEASE_PLATFORM: linux");
    expect(workflow).toContain("Upload linux publish manifest");
    expect(workflow).toContain("open-design-beta-linux-publish-manifest");
    expect(workflow).not.toContain("Download linux e2e spec report");
    expectReleaseLinuxBuildPreservesEvidence(workflow, "Build beta linux artifacts");
    expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow, "Smoke beta linux AppImage runtime");
  });

  it("preserves stable linux AppImage smoke reports for release publication", async () => {
    const workflow = await readFile(releaseStableWorkflowPath, "utf8");
    const linuxBuildStep = workflow.match(
      /- name: Build release linux artifacts\n(?:.+\n)+?(?=\n      - name: Smoke release linux AppImage runtime)/m,
    );
    expect(linuxBuildStep?.[0]).toBeDefined();
    expect(linuxBuildStep?.[0]).toContain(
      'node -e \'const fs = require("node:fs"); JSON.parse(fs.readFileSync(process.argv[1], "utf8"));\' "$build_json_path"',
    );
    expect(workflow).toContain("Smoke release linux AppImage runtime");
    expect(workflow).toContain("manifest.json");
    expect(workflow).toContain("tools-pack.json");
    expect(workflow).toContain("Upload linux e2e spec report");
    expect(workflow).toContain("open-design-release-linux-e2e-report");
    expect(workflow).toContain("Download linux e2e spec report");
    expectReleaseLinuxBuildPreservesEvidence(workflow, "Build release linux artifacts");
    expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow, "Smoke release linux AppImage runtime");
  });

  it("keeps release namespaces aligned with release channels", async () => {
    const [releaseStableWorkflow, releaseStableScript, releasePreviewWorkflow, releaseBetaWorkflow] = await Promise.all([
      readFile(releaseStableWorkflowPath, "utf8"),
      readFile(releaseStableScriptPath, "utf8"),
      readFile(releasePreviewWorkflowPath, "utf8"),
      readFile(releaseBetaWorkflowPath, "utf8"),
    ]);

    expect(releaseStableScript).toContain('const mac = channel === "nightly" ? "release-nightly" : "release-stable";');
    expect(releaseStableScript).toContain('setOutput("namespace", namespaces.mac);');
    expect(releaseStableScript).toContain('setOutput("mac_intel_namespace", namespaces.macIntel);');
    expect(releaseStableScript).toContain('setOutput("win_namespace", namespaces.win);');
    expect(releaseStableScript).toContain('setOutput("linux_namespace", namespaces.linux);');

    expect(releaseStableWorkflow).toContain("namespace: ${{ steps.stable.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain("mac_intel_namespace: ${{ steps.stable.outputs.mac_intel_namespace }}");
    expect(releaseStableWorkflow).toContain("win_namespace: ${{ steps.stable.outputs.win_namespace }}");
    expect(releaseStableWorkflow).toContain("linux_namespace: ${{ steps.stable.outputs.linux_namespace }}");
    expect(releaseStableWorkflow).toContain('--namespace "${{ needs.metadata.outputs.namespace }}"');
    expect(releaseStableWorkflow).toContain("OD_PACKAGED_E2E_NAMESPACE: ${{ needs.metadata.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain("TOOLS_PACK_NAMESPACE: ${{ needs.metadata.outputs.namespace }}");
    expect(releaseStableWorkflow).toContain('"--namespace", "${{ needs.metadata.outputs.win_namespace }}",');
    expect(releaseStableWorkflow).toContain('OD_PACKAGED_E2E_NAMESPACE: ${{ needs.metadata.outputs.win_namespace }}');
    expect(releaseStableWorkflow).toContain('TOOLS_PACK_NAMESPACE: ${{ needs.metadata.outputs.win_namespace }}');
    expect(releaseStableWorkflow).toContain('--namespace "${{ needs.metadata.outputs.linux_namespace }}"');
    expect(releaseStableWorkflow).toContain('"namespace": "${{ needs.metadata.outputs.linux_namespace }}",');
    expect(releaseStableWorkflow).not.toMatch(/--namespace release-stable(?:-intel|-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/OD_PACKAGED_E2E_NAMESPACE: release-stable(?:-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/TOOLS_PACK_NAMESPACE: release-stable(?:-intel|-win|-linux)?\b/);
    expect(releaseStableWorkflow).not.toMatch(/namespaces\/release-stable(?:-intel|-win|-linux)?\b/);

    expectChannelWorkflowNamespaces(releasePreviewWorkflow, "preview", { hasLinuxSmoke: false });
    expectChannelWorkflowNamespaces(releaseBetaWorkflow, "beta", { hasLinuxSmoke: true });
    expect(releaseBetaWorkflow).toContain("OD_PACKAGED_E2E_RELEASE_CHANNEL: beta");
    expect(releaseBetaWorkflow).toContain("OD_PACKAGED_E2E_RELEASE_VERSION: ${{ needs.metadata.outputs.beta_version }}");
  });

  it("keeps the self-hosted beta lane metadata-driven with reusable platform publish scripts", async () => {
    const [workflow, macAssetsScript] = await Promise.all([
      readFile(releaseBetaSelfHostedWorkflowPath, "utf8"),
      readFile(releaseMacAssetsScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("win_enable:");
    expect(workflow).toContain("mac_enable:");
    expect(workflow).toMatch(/win_enable:[\s\S]*?default: true/);
    expect(workflow).toMatch(/mac_enable:[\s\S]*?default: true/);
    expect(workflow).toMatch(/publish:[\s\S]*?default: true/);
    expect(workflow).toMatch(/s3_public_origin:[\s\S]*?default: "https:\/\/s3\.nexu\.space\/od-releases"/);
    expect(workflow).toContain("win_smoke_mode:");
    expect(workflow).toContain("win_target:");
    expect(workflow).toContain("win_update_metadata_url:");
    expect(workflow).toContain("win_update_target_version:");
    expect(workflow).toContain("mac_sign_mode:");
    expect(workflow).toContain("mac_smoke_mode:");
    expect(workflow).toMatch(/win_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
    expect(workflow).toMatch(/mac_smoke_mode:[\s\S]*?options:[\s\S]*?- skip[\s\S]*?- core[\s\S]*?- full[\s\S]*?default: core/);
    expect(workflow).toMatch(/win_sign_mode:[\s\S]*?options:[\s\S]*?- "off"[\s\S]*?- "on"[\s\S]*?default: "off"/);
    expect(workflow).not.toMatch(/win_sign_mode:[\s\S]*?- "auto"/);
    expect(workflow).toMatch(/mac_sign_mode:[\s\S]*?options:[\s\S]*?- "no"[\s\S]*?- "sign-only"[\s\S]*?- "notarize"[\s\S]*?default: "sign-only"/);
    expect(workflow).not.toMatch(/^      enable_win:/m);
    expect(workflow).not.toMatch(/^      enable_mac:/m);
    expect(workflow).not.toMatch(/^      sign_mode:/m);
    expect(workflow).not.toMatch(/^      smoke_mode:/m);
    expect(workflow).not.toMatch(/^      update_metadata_url:/m);
    expect(workflow).not.toMatch(/^      update_target_version:/m);
    expect(workflow).toContain("name: Prepare beta metadata");
    expect(workflow).toContain("OPEN_DESIGN_BETA_METADATA_URL: ${{ inputs.s3_public_origin }}/beta/latest/metadata.json");
    expect(workflow).toContain("OPEN_DESIGN_STABLE_METADATA_URL: https://releases.open-design.ai/stable/latest/metadata.json");
    expect(workflow).toContain("path: _release-metadata");
    expect(workflow).toContain("working-directory: _release-metadata");
    expect(workflow).toContain("apps/packaged/package.json");
    expect(workflow).toContain("scripts/release-beta.ts");
    expect(workflow).not.toContain('git fetch --force --depth=1 origin "+refs/tags/open-design-v*:refs/tags/open-design-v*"');
    expect(workflow).toContain("release-beta-s requires at least one self-hosted platform");
    expect(workflow).toContain("name: Probe Windows signing capability");
    expect(workflow).toContain("probe-win-signing.ps1");
    expect(workflow).toContain("needs: metadata");
    expect(workflow).toContain('-ReleaseVersion "${{ inputs.release_version || needs.metadata.outputs.beta_version }}"');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNING_ENABLED: ${{ steps.sign_probe.outputs.enabled }}');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNING_PROBED: ${{ steps.sign_probe.outputs.probed }}');
    expect(workflow).toContain('OD_BETA_WINDOWS_SIGNTOOL_PATH: ${{ steps.sign_probe.outputs.signtool_path }}');
    expect(workflow).toContain("Publish beta candidate platform to Nexu S3");
    expect(workflow).toContain("publish-platform.ps1");
    expect(workflow).toContain("name: Publish windows build report");
    expect(workflow).toContain(".github\\scripts\\release\\report\\win.ps1");
    expect(workflow).toContain("REPORT_ROOT: C:\\.tmp\\runner\\od-beta\\win\\release-report\\win");
    expect(workflow).toContain("REPORT_ZIP_PATH: C:\\.tmp\\runner\\od-beta\\win\\release-report\\win-report.zip");
    expect(workflow).not.toContain("name: Upload windows e2e spec report");
    expect(workflow).not.toContain("open-design-beta-win-e2e-report");
    expect(workflow).not.toContain("Upload windows publish manifest");
    expect(workflow).not.toContain("open-design-beta-win-publish-manifest");
    expect(workflow).toContain("if: ${{ inputs.mac_smoke_mode != 'skip' }}");
    expect(workflow).toContain("OD_PACKAGED_E2E_MAC_SMOKE_PROFILE: ${{ inputs.mac_smoke_mode }}");
    expect(workflow).not.toContain("name: Upload mac e2e spec report");
    expect(workflow).toContain("runs-on: [self-hosted, macOS, ARM64, nexu-mac, release-beta]");
    expect(workflow).toContain("path: _release-build");
    expect(workflow).toContain("working-directory: _release-build");
    expect(workflow).toContain("working-directory: _release-build/e2e");
    expect(workflow).toContain("bash .github/scripts/release/build-mac.sh");
    expect(workflow).toContain("MAC_TOOLS_PACK_CACHE_DIR: /Users/runner/.tmp/runner/od-beta/mac/tools-pack-cache");
    expect(workflow).toContain("MAC_TOOLS_PACK_DIR: /Users/runner/.tmp/runner/od-beta/mac/tools-pack");
    expect(workflow).toContain("TOOLS_PACK_CACHE_DIR: ${{ env.MAC_TOOLS_PACK_CACHE_DIR }}");
    expect(workflow).toContain("TOOLS_PACK_DIR: ${{ env.MAC_TOOLS_PACK_DIR }}");
    expect(workflow).toContain("name: Publish mac build summary");
    expect(workflow).toContain("bash .github/scripts/release/report/mac.sh");
    expect(workflow).toContain("name: Refresh mac release report");
    expect(workflow).toContain("REPORT_ROOT: ${{ runner.temp }}/release-report/mac");
    expect(workflow).toContain("REPORT_ZIP_PATH: ${{ runner.temp }}/release-report/mac-report.zip");
    expect(workflow).toContain("OD_PACKAGED_E2E_TOOLS_PACK_DIR: ${{ env.MAC_TOOLS_PACK_DIR }}");
    expect(workflow).toContain("name: Prune mac tools-pack cache");
    expect(workflow).toContain("CACHE_ROOT: ${{ env.MAC_TOOLS_PACK_CACHE_DIR }}");
    expect(workflow).toContain("bash .github/scripts/release/cache/mac.sh");
    expect(workflow).toContain("MAC_SIGN_MODE: ${{ inputs.mac_sign_mode }}");
    expect(workflow).toContain("OPEN_DESIGN_RELEASE_PROFILE: /Users/runner/.profile");
    expect(workflow).toContain("ASSET_VERSION_SUFFIX: ${{ inputs.mac_sign_mode != 'no' && '.signed' || '.unsigned' }}");
    expect(macAssetsScript).toContain('tools_pack_dir="${TOOLS_PACK_DIR:-$RUNNER_TEMP/tools-pack}"');
    expect(macAssetsScript).toContain('source_dmg="$tools_pack_dir/out/mac/namespaces/$TOOLS_PACK_NAMESPACE/dmg/Open Design-$TOOLS_PACK_NAMESPACE.dmg"');
    expect(workflow).toContain("Publish beta mac candidate platform to Nexu S3");
    expect(workflow).toContain("RELEASE_PLATFORM: mac");
    expect(workflow).toContain("RELEASE_SIGNED: ${{ inputs.mac_sign_mode != 'no' && 'true' || 'false' }}");
    expect(workflow).toContain("REPORT_ZIP_PATH: ${{ runner.temp }}/release-report/mac-report.zip");
    expect(
      workflow.match(/- name: Publish beta mac candidate platform to Nexu S3\n(?:.+\n)+?          node --experimental-strip-types \.github\/scripts\/release\/r2\/publish-platform\.ts/m)?.[0],
    ).toContain("OPEN_DESIGN_RELEASE_PROFILE: /Users/runner/.profile");
    expect(workflow).not.toContain("Upload mac publish manifest");
    expect(workflow).not.toContain("open-design-beta-mac-publish-manifest");
    expect(workflow).toContain("name: Publish beta metadata to Nexu S3");
    expect(workflow).not.toContain("Download mac publish manifest");
    expect(workflow).toContain("path: _release-publish");
    expect(workflow).toContain(".github/scripts/release/r2/");
    expect(workflow).toContain("working-directory: _release-publish");
    expect(workflow).toContain("node --experimental-strip-types .github/scripts/release/r2/publish-beta-metadata.ts");
    expect(workflow).toContain("ASSET_VERSION_SUFFIX: auto");
    expect(workflow).toContain("PLATFORM_MANIFEST_PREFIX: beta/latest/platforms");
    expect(workflow).not.toContain("actions/upload-artifact@");
    expect(workflow).not.toContain("actions/download-artifact@");
    expect(workflow).toContain('STATE_SOURCE: ${{ needs.metadata.outputs.state_source }}');
    expect(workflow).toContain("Verify beta metadata");
    expect(workflow).toContain("node --experimental-strip-types .github/scripts/release/r2/verify-beta-metadata.ts");
    expect(workflow).not.toContain("actions/setup-node@v6");
    expect(workflow).not.toContain("publish-beta-metadata.ps1");
    expect(workflow).not.toContain("probe-beta-public-read.ps1");
    expect(workflow).not.toContain("publish-beta.ps1 -IndexPath");
  });

  it("keeps Windows release report zips materialized before platform publication", async () => {
    const [workflow, winReportScript, publishCommonScript] = await Promise.all([
      readFile(releaseBetaSelfHostedWorkflowPath, "utf8"),
      readFile(releaseWinReportScriptPath, "utf8"),
      readFile(releasePublishBetaCommonScriptPath, "utf8"),
    ]);

    expect(workflow).toContain("REPORT_ZIP_PATH: C:\\.tmp\\runner\\od-beta\\win\\release-report\\win-report.zip");
    expect(workflow).toContain("C:\\.tmp\\runner\\od-beta\\win\\release-report\\win-report.zip");
    expect(winReportScript).toContain("Get-ChildItem -LiteralPath $ReportRoot -Force");
    expect(winReportScript).toContain("Compress-Archive -LiteralPath $items");
    expect(publishCommonScript).toContain("Get-ChildItem -LiteralPath $ReportRoot -Force");
    expect(publishCommonScript).toContain("Compress-Archive -LiteralPath $reportItems");
    expect(winReportScript).not.toMatch(/Compress-Archive -LiteralPath\s+\(Join-Path\s+\$ReportRoot\s+"\\*"\)/);
    expect(publishCommonScript).not.toMatch(/Compress-Archive -LiteralPath\s+\(Join-Path\s+\$ReportRoot\s+"\\*"\)/);
  });
});

function expectChannelWorkflowNamespaces(
  workflow: string,
  channel: "beta" | "preview",
  options: { hasLinuxSmoke: boolean },
): void {
  const namespace = `release-${channel}`;
  expect(workflow).toContain(`--namespace ${namespace}`);
  expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}`);
  expect(workflow).toContain(`--namespace ${namespace}-intel`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}-intel`);
  expect(workflow).toContain(`"--namespace", "${namespace}-win",`);
  expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}-win`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}-win`);
  expect(workflow).toContain(`--namespace ${namespace}-linux`);
  expect(workflow).toContain(`TOOLS_PACK_NAMESPACE: ${namespace}-linux`);

  if (options.hasLinuxSmoke) {
    expect(workflow).toContain(`OD_PACKAGED_E2E_NAMESPACE: ${namespace}-linux`);
  }
}

function expectReleaseLinuxBuildPreservesEvidence(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n(?:.+\\n)+?(?=\\n      - name: Smoke .+ linux AppImage runtime)`, "m"))?.[0];
  expect(step).toBeDefined();
  expect(step).toContain('report_dir="$RUNNER_TEMP/release-report/linux"');
  expect(step).toContain('mkdir -p "$report_dir"');
  expect(step).toContain('build_json_path="$report_dir/tools-pack.json"');
  expect(step).toContain('build_log_path="$report_dir/tools-pack.log"');
  expect(step).toContain('printf \'%s\\n\' "$build_output" | tee "$build_json_path"');
}

function expectReleaseLinuxSmokePreservesEvidenceBeforeApt(workflow: string, stepName: string): void {
  const step = workflow.match(new RegExp(`- name: ${stepName}\\n(?:.+\\n)+?(?=\\n      - name: Upload linux e2e spec report)`, "m"))?.[0];
  expect(step).toBeDefined();
  const aptIndex = step?.indexOf("sudo apt-get update") ?? -1;
  const reportDirIndex = step?.indexOf('report_dir="$RUNNER_TEMP/release-report/linux"') ?? -1;

  expect(aptIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeGreaterThan(-1);
  expect(reportDirIndex).toBeLessThan(aptIndex);
}
