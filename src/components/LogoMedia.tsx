import React, { useState, useEffect, useRef } from "react";
import { defaultIdentity, type SiteIdentity } from "../lib/identity.ts";
export function LogoMedia({
  identity = defaultIdentity,
}: {
  identity?: SiteIdentity;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduced, setReduced] = useState(true),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useEffect(() => setFailed(false), [identity.asset?.url]);
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && !document.hidden)
        video.play().catch(() => setFailed(true));
      else video.pause();
    });
    observer.observe(video);
    const visibility = () => {
      if (document.hidden) video.pause();
      else video.play().catch(() => setFailed(true));
    };
    document.addEventListener("visibilitychange", visibility);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", visibility);
      video.pause();
    };
  }, [identity.asset?.url, reduced, failed]);
  const asset = identity.asset;
  if (
    !asset ||
    failed ||
    ((asset.kind === "video" || asset.kind === "gif") && reduced)
  )
    return (
      <span className="brand-cube" aria-hidden="true">
        N
      </span>
    );
  const style: React.CSSProperties = {
    objectFit: identity.fit,
    objectPosition: `${identity.x}% ${identity.y}%`,
  };
  return (
    <span className="brand-media" aria-hidden="true">
      {asset.kind === "video" ? (
        <video
          ref={videoRef}
          src={asset.url}
          autoPlay
          loop
          muted
          playsInline
          preload="metadata"
          style={style}
          onError={() => setFailed(true)}
        />
      ) : (
        <img
          src={asset.url}
          alt=""
          decoding="async"
          style={style}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}
