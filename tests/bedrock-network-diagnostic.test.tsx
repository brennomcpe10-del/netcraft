import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
test("Bedrock HTTPS diagnostic stays disabled and separate from runtime", async () => {
  const source = await readFile(new URL("../minecraft/delivery-simulation/bedrockNetworkDiagnostic.js", import.meta.url), "utf8");
  assert.match(source, /from "@minecraft\/server-net"/);
  assert.match(source, /const DISABLED = true;/);
  assert.match(source, /if \(DISABLED \|\| options.enabled !== true\)/);
  assert.match(source, /no_test_endpoint_configured/);
  assert.doesNotMatch(source, /runCommand|give\s|grantVip|MERCADOPAGO_|https:\/\/[^" ]+/);
  const packageJson = await readFile(new URL("../package.json", import.meta.url), "utf8");
  assert.doesNotMatch(packageJson, /bedrockNetworkDiagnostic/);
});
