// user-facing CLI failure; the executable entry maps it to stderr and
// exit code 1 — helpers throw instead of exiting so they stay testable
export class CliError extends Error {}
