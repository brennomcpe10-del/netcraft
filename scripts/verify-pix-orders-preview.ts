// Runs exclusively during Preview builds with the existing server-side Preview credential.
// The official APRO fixture is not a shop product, does not touch Firestore, and never queues delivery.
import crypto from "node:crypto";
import { writeFile, mkdir } from "node:fs/promises";
import {
  MercadoPago,
  PixError,
  testToken,
  validationDiagnostics,
} from "../server/payments/mercadoPago.ts";
import {
  verifyOrder,
  ordersState,
  orderExpiry,
} from "../server/payments/ordersContract.ts";
if (process.env.VERCEL_ENV !== "preview") {
  console.log(
    "Orders API official Pix probe: REFUSED (requires Vercel Preview environment).",
  );
  process.exit(1);
}
const statuses: { operation: string; status: number }[] = [];
const validation: ReturnType<typeof validationDiagnostics>[] = [];
const metadata = {
  environment: "preview",
  commit: /^[a-f0-9]{40}$/.test(process.env.VERCEL_GIT_COMMIT_SHA || "")
    ? process.env.VERCEL_GIT_COMMIT_SHA : null,
  checkedAt: new Date().toISOString(),
  deliveryEnabled: false,
  firestoreTouched: false,
};
try {
  const gateway = new MercadoPago(testToken(), async (url, options) => {
    const response = await fetch(url, options);
    const path = new URL(String(url)).pathname;
    statuses.push({
      operation:
        options?.method === "POST"
          ? "POST /v1/orders"
          : path === "/users/me"
            ? "GET /users/me"
            : "GET /v1/orders/:id",
      status: response.status,
    });
    if (!response.ok) {
      try { validation.push(validationDiagnostics(await response.clone().json())); }
      catch { /* No raw response text in diagnostics. */ }
    }
    return response;
  });
  const receiver = await gateway.me();
  if (receiver.netcraftTestAccount !== true)
    throw new PixError(
      "O teste oficial requer recebedor identificado pela API como test_user. Nenhuma cobrança foi criada.",
      503,
    );
  const reference = "netcraft_test_" + crypto.randomUUID().replaceAll("-", "");
  // Isolate the official sandbox Pix contract: do not include optional shop items.
  const request = {
    type: "online",
    external_reference: reference,
    total_amount: "50.00",
    payer: { email: "test_payer@example.com", first_name: "APRO" },
    transactions: {
      payments: [{
        amount: "50.00",
        payment_method: { id: "pix", type: "bank_transfer" },
      }],
    },
  };
  const resource = await gateway.create(request, crypto.randomUUID());
  const expected = {
    id: reference,
    collector: String(receiver.id),
    currency: "BRL",
    totalCents: 5000,
    receiverIsTestAccount: true,
  };
  const payment = verifyOrder(resource, expected, String(receiver.id));
  const fetched = await gateway.get(resource.id);
  const verified = verifyOrder(
    fetched,
    {
      ...expected,
      providerOrderId: resource.id,
      ...(payment ? { paymentId: payment.id } : {}),
    },
    String(receiver.id),
  );
  const state = ordersState(
    fetched,
    verified,
    orderExpiry(
      fetched,
      verified,
      new Date(Date.now() + 86400000).toISOString(),
    ),
  );
  const result = {
    ...metadata,
    api: "orders-v1",
    result: "valid_authenticated_response",
    state,
    qrCodeReturned: !!verified?.payment_method?.qr_code,
    qrImageReturned: !!verified?.payment_method?.qr_code_base64,
    operations: statuses,
    deliveryEnabled: false,
    firestoreTouched: false,
  };
  await mkdir("dist", { recursive: true });
  await writeFile(
    "dist/pix-orders-sandbox-check.json",
    JSON.stringify(result, null, 2),
  );
  console.log("Orders API official Pix probe:", JSON.stringify(result));
} catch (error) {
  const safe =
    error instanceof PixError
      ? error.message
      : "Falha de rede ou resposta inválida no teste oficial Pix Orders API.";
  await mkdir("dist", { recursive: true });
  await writeFile("dist/pix-orders-sandbox-check.json", JSON.stringify({
    ...metadata,
    api: "orders-v1",
    result: "failed",
    qrCodeReturned: false,
    qrImageReturned: false,
    operations: statuses,
    validation,
    // Fixed text only; no exception messages, provider values or buyer data.
    reason: "sandbox_probe_failed",
  }, null, 2));
  console.error("Orders API official Pix probe: FAILED.", safe);
  process.exitCode = 1;
}
