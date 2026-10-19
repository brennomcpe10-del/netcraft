import express from "express";
import { requireAdmin } from "../auth/admin.ts";
import { validateLogo } from "../services/logoValidation.ts";
import {
  readIdentity,
  storeLogo,
  saveIdentity,
  signUpload,
  verifyUpload,
} from "../services/identityStore.ts";
export const identityRouter = express.Router();
identityRouter.get("/identity", async (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  try {
    res.json(await readIdentity());
  } catch {
    res.status(503).json({
      error: "Identidade visual indisponível. O logo padrão será mantido.",
    });
  }
});
identityRouter.post(
  "/admin/identity/upload",
  requireAdmin,
  async (req, res) => {
    let validated;
    try {
      const { data, mime } = req.body || {};
      if (
        typeof data !== "string" ||
        data.length > 4194304 ||
        data.length % 4 !== 0 ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(data) ||
        typeof mime !== "string"
      )
        throw new Error("Arquivo inválido ou maior que 3 MB.");
      validated = await validateLogo(Buffer.from(data, "base64"), mime);
      if (
        ["image/png", "image/jpeg", "image/webp"].includes(validated.mime) &&
        validated.bytes.length > 170000
      )
        return res
          .status(413)
          .json({
            error: "Comprima a imagem para até 170 KB antes de enviar.",
          });
    } catch (error) {
      return res.status(400).json({ error: (error as Error).message });
    }
    try {
      const asset = await storeLogo(validated);
      res.json({ asset, uploadToken: signUpload(asset) });
    } catch (error) {
      res.status(503).json({
        error:
          process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
          process.env.GOOGLE_APPLICATION_CREDENTIALS
            ? "GIF, SVG e vídeo dependem do Firebase Storage, que não está disponível para este envio. PNG, JPG e WebP usam o catálogo e continuam disponíveis."
            : "Armazenamento de GIF/SVG/vídeo indisponível. Envie PNG, JPG ou WebP; imagens estáticas não precisam dessa configuração.",
      });
    }
  },
);
identityRouter.put("/admin/identity", requireAdmin, async (req, res) => {
  try {
    const asset =
      req.body.reset === true
        ? null
        : req.body.uploadToken
          ? verifyUpload(req.body.uploadToken)
          : (await readIdentity()).asset;
    res.json(await saveIdentity(asset, req.body));
  } catch (error) {
    res.status(503).json({
      error:
        error instanceof Error &&
        /enquadramento|upload|referência|expir|animado/i.test(error.message)
          ? error.message
          : "Não foi possível confirmar o salvamento do logo no Firebase. A alteração não foi publicada. Tente novamente.",
    });
  }
});
