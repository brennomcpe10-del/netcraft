import { fileTypeFromBuffer } from "file-type";
import { imageSize } from "image-size";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import { Input, BufferSource, ALL_FORMATS } from "mediabunny";
import { LOGO_LIMITS } from "../../src/lib/identity.ts";
export async function validateLogo(buffer: Buffer, declared: string) {
  if (!buffer.length || buffer.length > LOGO_LIMITS.video)
    throw new Error("Arquivo vazio ou maior que 3 MB.");
  let mime: string | undefined;
  if (declared !== "image/svg+xml")
    mime = (await fileTypeFromBuffer(buffer))?.mime;
  let bytes = buffer;
  let width = 0,
    height = 0,
    duration: number | undefined;
  if (declared === "image/svg+xml") {
    const xml = buffer.toString("utf8");
    if (buffer.length > LOGO_LIMITS.image || /<!|<\?|&/i.test(xml))
      throw new Error(
        "SVG deve ser simples, sem entidades, declarações ou referências externas.",
      );
    const document = new DOMParser({
      onError: () => {
        throw new Error("SVG inválido.");
      },
    }).parseFromString(xml, "image/svg+xml");
    const root = document.documentElement;
    if (
      root?.localName !== "svg" ||
      root.namespaceURI !== "http://www.w3.org/2000/svg"
    )
      throw new Error("SVG inválido.");
    const tags = new Set([
      "svg",
      "g",
      "path",
      "circle",
      "ellipse",
      "rect",
      "line",
      "polyline",
      "polygon",
      "defs",
      "linearGradient",
      "radialGradient",
      "stop",
      "clipPath",
      "title",
      "desc",
    ]);
    const attributes = new Set([
      "xmlns",
      "viewBox",
      "width",
      "height",
      "x",
      "y",
      "x1",
      "x2",
      "y1",
      "y2",
      "cx",
      "cy",
      "r",
      "rx",
      "ry",
      "d",
      "points",
      "fill",
      "stroke",
      "stroke-width",
      "stroke-linecap",
      "stroke-linejoin",
      "stroke-miterlimit",
      "fill-rule",
      "clip-rule",
      "opacity",
      "fill-opacity",
      "stroke-opacity",
      "transform",
      "id",
      "offset",
      "stop-color",
      "stop-opacity",
      "gradientUnits",
      "gradientTransform",
      "clip-path",
      "preserveAspectRatio",
    ]);
    let count = 0;
    const walk = (node: any) => {
      if (++count > 2000) throw new Error("SVG muito complexo.");
      if (node.nodeType === 1) {
        if (
          !tags.has(node.localName) ||
          node.namespaceURI !== root.namespaceURI
        )
          throw new Error("Elemento SVG não permitido.");
        for (const attr of Array.from(node.attributes) as any[]) {
          if (
            attr.name === "xmlns" &&
            attr.value === "http://www.w3.org/2000/svg"
          )
            continue;
          if (
            !attributes.has(attr.name) ||
            /javascript:|https?:|data:|\/\//i.test(attr.value) ||
            (/url\(/i.test(attr.value) &&
              !/^url\(#[a-zA-Z0-9_-]+\)$/.test(attr.value))
          )
            throw new Error("Atributo SVG não permitido.");
        }
      } else if (node.nodeType !== 3)
        throw new Error("Conteúdo SVG não permitido.");
      for (const child of Array.from(node.childNodes || [])) walk(child);
    };
    walk(root);
    const view = (root.getAttribute("viewBox") || "")
      .trim()
      .split(/[ ,]+/)
      .map(Number);
    width = Number(root.getAttribute("width")) || view[2];
    height = Number(root.getAttribute("height")) || view[3];
    bytes = Buffer.from(new XMLSerializer().serializeToString(root));
    mime = "image/svg+xml";
  } else if (mime === "video/mp4" || mime === "video/webm") {
    const input = new Input({
      source: new BufferSource(buffer),
      formats: ALL_FORMATS,
    });
    try {
      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error("Vídeo sem imagem.");
      const codec = await track.getCodec();
      if (
        (mime === "video/mp4" && codec !== "avc") ||
        (mime === "video/webm" && !["vp8", "vp9"].includes(codec || ""))
      )
        throw new Error("Use MP4/H.264 ou WebM/VP8/VP9.");
      duration = await input.computeDuration();
      width = await track.getDisplayWidth();
      height = await track.getDisplayHeight();
      if (
        !Number.isFinite(duration) ||
        duration <= 0 ||
        duration > LOGO_LIMITS.seconds
      )
        throw new Error("O vídeo deve ter até 8 segundos.");
    } finally {
      input.dispose();
    }
  } else {
    if (
      !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
        mime || "",
      )
    )
      throw new Error("Use PNG, JPG, WebP, SVG seguro, GIF, MP4 ou WebM.");
    const dimensions = imageSize(buffer);
    width = dimensions.width;
    height = dimensions.height;
  }
  if (mime !== declared)
    throw new Error(
      "O conteúdo do arquivo não corresponde ao formato informado.",
    );
  const kind = mime.startsWith("video/")
    ? "video"
    : mime === "image/gif"
      ? "gif"
      : "image";
  if (bytes.length > LOGO_LIMITS[kind])
    throw new Error(
      "Arquivo acima do limite: imagens 1 MB, GIF 2 MB e vídeo 3 MB.",
    );
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > LOGO_LIMITS.pixels ||
    height > LOGO_LIMITS.pixels
  )
    throw new Error("Use dimensões entre 1 e 2048 pixels.");
  return {
    bytes,
    mime,
    kind,
    width,
    height,
    ...(duration ? { duration } : {}),
  } as const;
}
