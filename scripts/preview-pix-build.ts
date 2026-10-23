import { execFileSync } from "node:child_process";

// The shop build remains independent of sandbox availability. A failed check is
// explicitly reported as failed; READY is never evidence of Pix homologation.
export function runPreviewPixCheck(
  env: NodeJS.ProcessEnv = process.env,
  execute = () => execFileSync("npm", ["run", "test:pix:preview"], {
    stdio: "inherit", env, timeout: 60000,
  }),
  warn: (message: string) => void = console.warn,
) {
  if (env.VERCEL_ENV !== "preview" ||
      env.VERCEL_GIT_COMMIT_REF !== "redesign-mobile-solaris") return "skipped";
  try {
    execute();
    return "passed";
  } catch {
    warn("Pix sandbox check FAILED. Inspect pix-orders-sandbox-check.json; the shop build is not Pix approval.");
    return "failed";
  }
}
