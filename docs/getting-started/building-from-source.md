# Building from Source

This guide is for contributors and power users who want the latest bleeding-edge DragonFruit code.

If you only want to use DragonFruit, use prebuilt releases from the [Installation](installation.md) page.

## Prerequisites

Install the following before building:

- **Git**
- **Node.js** 22 and `npm`. The release and PR build workflows use Node 22.23.1; use that version when reproducing their builds.
- **Rust toolchain** via `rustup`. On Windows, install the MSVC target, Visual Studio C++ Build Tools, a Windows SDK, and CMake.
- **Platform-specific Tauri system dependencies**

On Windows, run the build from a normal user terminal with Node, Rust, and the Visual Studio C++ environment on that terminal's `PATH`.

!!! tip
      If desktop build steps fail early, the most common cause is missing Tauri system dependencies on your OS.

## 1) Clone the repository

1. Clone `Open-Resin-Alliance/DragonFruit`.
2. Enter the repository root.

## 2) Install JavaScript dependencies

Install frontend/tooling dependencies:

- `npm install`

## 3) Optional: initialize plugin submodules

Some complex plugin integrations may be included as submodules under `plugins/`.

If you are working on those integrations, initialize/update submodules.
If not, DragonFruit can still run/build with available plugins and skips missing ones.

## 4) Run desktop development mode

Start the Tauri desktop app in development mode:

- `npm run tauri:dev`

This launches the desktop runtime and enables iterative frontend + backend development.

## 5) Build production artifacts

To create a release-style desktop build for your current OS:

- `npm run tauri:build`

Common outputs by platform:

- **Windows:** `.exe` (NSIS)
- **macOS:** `.dmg`
- **Linux:** `.flatpak` (project workflow may include additional Flatpak steps)

### First stickninja fork package (Windows)

The fork's `0.1.0` package is a manual, unsigned Windows x64 NSIS release. Use Node **22.23.1** to match the release CI version, along with the Windows Rust/MSVC, C++ Build Tools, SDK, and CMake prerequisites above. In the fork checkout, `npm version <version> --no-git-tag-version` updates the npm package and lockfile and runs the repository's version sync for Tauri and Cargo. Review those changes before building; do not create a Git tag as part of this command.

On a supported Windows x64 build host, `npx tauri build --bundles nsis` produces the installer for the default host target. The fork uses a separate app identity and app data. Its first installer does not register `.voxl` file associations or COM thumbnails, and it does not migrate profiles automatically. Updates are manual from the fork's releases until a fork-specific signed updater is available.

The inherited macOS and Linux recipes describe the upstream project. The original-repository-only release, nightly, and docs workflows intentionally skip publishing in this fork. The 0.1.0 Windows x64 optimized build and silent installation check passed; validate artifacts after any local change.

## 6) Useful verification commands

Run checks before opening a PR:

- `npm run lint`
- `npm run test`

## Common build issues

If a source build fails:

1. Re-check Tauri prerequisites for your platform.
2. Confirm Rust and Node are installed and on `PATH`.
3. Remove stale dependency/build caches, then reinstall.
4. Search existing reports or open a new issue:
   - https://github.com/Open-Resin-Alliance/DragonFruit/issues

## Next steps

- For user install paths and release channels, see [Installation](installation.md).
- For architecture and internals, continue to the Developer Guide.
