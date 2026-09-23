# Phase 0.1 acceptance: output filenames

**Status:** Accepted by the user on 2026-09-23. This accepts the Phase 0.1 feature, not a 0.1.0 release.

The behavior and manual checklist below define the phase target. The later **Verification performed** section records checks actually completed; unlisted checks remain open. Acceptance does not imply that every manual check was performed.

## Behavior

- The default pattern is `{printer_name}_{timestamp}_{material_name}_{layer_height}mm`.
- The editor documents and accepts `{printer_name}`, `{timestamp}`, `{material_name}`, `{layer_height}`, and optional `{layer_height_um}`. A micrometre pattern can use `{layer_height_um}um`; the `um` suffix is literal text in the pattern.
- A live sample updates when the pattern or its relevant printer, material, and layer-height inputs change. It shows the native output extension, which is added automatically and exactly once. The sample's timestamp may change when the job starts.
- A single timestamp is captured when each slicing/export job starts. The filename shown for that job matches its output even if slicing crosses a clock boundary.
- The chosen pattern persists across app restarts as a plain string in the shared slicing filename setting. A new installation uses the default pattern; a previously saved custom pattern remains in use across printer profiles.
- Empty, malformed, and unknown placeholders and unsafe template literals (including path separators) are rejected with a useful explanation before writing. Unsafe characters from printer or material profile names are adjusted to a safe basename with a visible warning; separators cannot create directories. Reserved device names are made safe, and the basename stays within the 220-byte UTF-8 limit.
- Fractional micrometre values retain their precision in `{layer_height_um}`; the `um` suffix comes from literal pattern text.
- The existing native file format and slice contents are unchanged by the filename setting.

## Manual review checklist

1. In a fresh profile, check the default pattern, preview, and exported basename against selected printer, material, and layer height.
2. Set a custom pattern using every supported placeholder, including `{layer_height_um}um`, restart the app, and confirm the pattern and preview persist.
3. Change printer, material, layer height, and pattern separately; confirm each sample change, then export and compare its filename to the filename shown for that job. Do not require the earlier sample timestamp to equal the job-start timestamp.
4. Check millimetre formatting and fractional micrometres at representative layer heights, including `0.05 mm` and `0.0305 mm`; confirm literal `mm` and `um` suffixes appear exactly as specified by the pattern.
5. Try empty, unknown, and malformed placeholders and unsafe template literals, including path separators; confirm a clear error. Try unsafe printer/material names, a reserved device name, and a long international name; confirm safe adjustment, a visible warning, a basename within 220 UTF-8 bytes, and no file written outside the chosen destination.
6. Export twice with a timestamp token. Confirm each job uses one consistent timestamp, including when slicing crosses a second boundary, and that exports to the same destination do not silently overwrite unexpectedly.
7. Open the resulting native output in its usual reader and compare slicing behavior to the same scene exported with the default filename.

Record platform, build, test input, and observed result for each check before closing this phase.

## Verification performed

The primary agent performed these checks on the Phase 0.1 worktree:

- Nine focused formatter tests passed after compilation with `tsc` and execution with `node --test`, without test shims; the normal-account `tsx` test runner also passed all nine. Full `tsc --noEmit`, focused ESLint on the changed slicing files, and `git diff --check` passed.
- Browser review mounted the production `SliceFilenameFormatEditor` and formatter in an isolated harness. The default millimetre preview, format and profile input changes, `0.0375 mm` to `37.5 um`, unknown token and path errors, reserved `CON` to `_CON.ctb`, and automatic extension exactly once behaved as expected. A custom format and Reset each persisted through a reload. The visual screenshot was readable.
- A normal-account Node 22.23.1 `tauri build --debug --no-bundle` completed successfully (exit 0, 634 seconds), including the frontend build, typecheck, thumbnail helpers, and native Rust compile. It produced `src-tauri/target/debug/dragonfruit-desktop.exe`.
- A separate local debug build with an isolated smoke-test app identity passed (exit 0, 33.53 seconds). Its native Windows application opened with a fresh profile. With Saturn 2 selected, a 10 × 10 × 0.5 mm calibration block imported as ten layers. The default millimetre preview was correct. After changing the pattern to `{printer_name}_{timestamp}_{material_name}_{layer_height_um}um`, the native Save dialog suggested `Saturn_2_20260923-171443_Default_Standard_405nm_50um.ctb`. The application reported CTB export complete; its Generated file and Saved to labels matched that exact filename and timestamp, even though saving finished later.
- The CTB file was independently confirmed at the selected destination with that exact basename, 158,738 bytes, and a later write time of 2026-09-23 17:15:08. The isolated app was closed through its UI and its process was confirmed stopped. After restart, the recent calibration STL reopened; Export still showed the exact custom pattern and a correct `50um` preview with a fresh timestamp.
- The final optimized Windows x64 frontend, typecheck, native, and NSIS build passed. The unsigned installer completed a silent installation with ProductName **DragonFruit (stickninja)**, Version `0.1.0`, and Publisher **stickninja**. The installed executable matched the built executable apart from the expected NSIS bundle-type marker. The official executable's SHA-256, official uninstall entry, and `.voxl` registration were unchanged. The final installed app opened with a fresh profile, showed the correct title and About version, and displayed **Download fork releases manually** in Settings with a link to the fork's releases.

The native smoke covers one small block and one printer profile. Other printer profiles, broader `SlicingPanel` workflows, output-reader compatibility, and printer behavior remain unverified. The browser harness simulated a job start; it did not slice. Full repository lint retains inherited errors; `page.tsx` showed the same 16 error signatures as upstream on unchanged lines.

This work is the accepted Phase 0.1 implementation. The remaining manual checks above are recorded as limitations, not passed results. The 0.1.0 Windows x64 package passed build and installation checks.
