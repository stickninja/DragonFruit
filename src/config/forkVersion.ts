/** Human-facing provenance is separate from the monotonic installed package version. */
export const INTERNAL_PACKAGE_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? '0.0.0';
export const UPSTREAM_VERSION = process.env.NEXT_PUBLIC_UPSTREAM_VERSION ?? INTERNAL_PACKAGE_VERSION;
export const FORK_REVISION = process.env.NEXT_PUBLIC_FORK_REVISION ?? '1';
export const FORK_DISPLAY_VERSION = `${UPSTREAM_VERSION} · stickninja r${FORK_REVISION}`;
