# Fork working rules

- Use subagents for implementation. The primary agent reviews their changes and owns integration.
- Choose a task-suitable GPT-6-family model and reasoning effort for each agent.
- Work in the accepted order documented in [docs/fork-roadmap.md](docs/fork-roadmap.md). Do not begin the next phase or publish a release until the current phase meets its acceptance checks and the user explicitly accepts it.
- Keep changes scoped to the active phase. Preserve upstream behavior outside that scope.
- Check behavior against the phase acceptance document and record which checks were actually performed; do not present planned manual checks as completed.
- Follow the developer guide's domain ownership and storage conventions when changing behavior; update the relevant workflow and storage documentation alongside implementation.
- Keep personal paths, device files, and hardware-specific file contents out of public documentation and commits.
