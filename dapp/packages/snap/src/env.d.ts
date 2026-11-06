// snaps-cli inlines process.env.* at build time (snap.config.ts `environment`).
declare const process: { env: Record<string, string | undefined> };
