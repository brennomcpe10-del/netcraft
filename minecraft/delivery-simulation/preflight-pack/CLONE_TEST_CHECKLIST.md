# Clone-only BDS secret header compatibility checklist (OFF)

This is a **manual future runbook**, not authorization to install or enable anything. The existing behavior pack remains inert: `scripts/main.js` emits only an OFF notice and never calls `secretHeaderProbe.js`.

## Local preconditions
- Clone a Bedrock Dedicated Server **1.26.61.1** test world and back it up. Never touch the live MagnoHost instance.
- Obtain permission before editing the cloned server configuration. Install only the dedicated preflight behavior pack there.
- Verify the pack's module UUID `99ac2e49-b003-46fc-8473-55700984acc7` is distinct from the old HTTPS diagnostic module `60c499db-2ac2-4b7e-8e68-8132f9b14a88`.
- On **the cloned server only**, grant `@minecraft/server-admin` and `@minecraft/server-net` as required by the versioned Bedrock API to this module UUID. Never modify global/default permissions.
- Use a synthetic, non-production secret via the server's protected secrets mechanism. Do not insert it in Git, addon assets, variables, screenshots, console output, or chat.

## Validation gates
1. With no secret installed, verify the inert pack starts without any outbound request. The unreferenced probe must not run.
2. In a **separately reviewed opt-in test build**, invoke an explicitly triggered diagnostic function to construct `new HttpHeader("x-nc-bds-token", SecretString)` without exposing the secret. A successful constructor does not prove HTTP authorization.
3. Only after reviewing a dedicated HTTPS sandbox origin, test authenticated challenge and empty poll with nonce use once. Never connect to a public disabled Worker, real orders, real players, or grant code.
4. Wrong/missing token, expired/unissued/reused challenge, offline player and ACK must fail closed. The server must never grant an item, command or VIP.

## Verified vs unverified
- Verified by owner's Windows **local** Wrangler/Workerd/SQLite run: 61-second expiry, concurrency (24 polls), durable restart persistence, replay rejection, blocked ACK. **Do not request this validation again.**
- Unverified: actual BDS 1.26.61.1 `SecretString` / `HttpHeader` interoperability and BDS-to-isolated-HTTPS end-to-end connectivity.
- The default public Worker config stays disabled; no deployment is performed here.
