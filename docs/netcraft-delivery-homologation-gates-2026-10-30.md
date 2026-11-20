# NetCraft Delivery — homologation gates (2026-10-30)

Changes in this iteration remain exclusive to `redesign-mobile-solaris`.

## Verified
- Prior GitHub Actions run `41113750150`: success.
- Simulation backend accepts signed HMAC requests and scoped `SecretString` header tokens for POST `/poll` and `/ack` only.
- Firestore Emulator mode uses transactional nonce claims and deduplicated ACK, rejects refunded jobs, keeps offline jobs waiting in simulation.
- Added bounded request/token validation, MIME requirement, and expiry for the in-memory nonce set used by unit tests.
- No direct item grants, VIP changes, Pix API calls, or real Firestore connections are wired to the simulated API.

## Not verified / blocked
- **No externally accessible isolated HTTPS hostname is deployed.** The existing loopback demo on `127.0.0.1` cannot be reached from the MagnoHost BDS.
- Real BDS `SecretString` headers and secure nonce entropy are not yet verified end to end; `Math.random` must never be substituted.
- The simulation backend does not prove player online presence using a trusted server session. Never rely on an untrusted gamertag claim for actual delivery or ACK.
- Reconciliation of refund/ACK races and lease-based delivery guarantees is simulation-only. No production release.
- `preflight-pack` remains inert; do not install/activate a delivery client on the public server.

## Infrastructure requirements, to be approved separately
Provide independent sandbox hosting with TLS certificate, private test-only database/emulator, credential injection, scoped firewall/endpoint policies, and no access to production payment or delivery resources. Verify restart/replay durability, no-ACK while player offline, duplicate requests and refund races before permitting a separate isolated BDS test instance.

No Production deployments, credentials, real payments or actual rewards were changed.
