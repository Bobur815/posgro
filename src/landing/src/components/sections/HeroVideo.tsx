import { useEffect, useRef, useState } from "react";
import styled from "styled-components";
import { HERO_POSTER_ALIAS, type LandingHeroVideo } from "@shared/types/landing.types";
import { MEDIA_BASE } from "../../config";
import { useHeroVideoAllowed } from "../../hooks/useHeroVideoAllowed";

const POSTER_WEBP = `${MEDIA_BASE}/${HERO_POSTER_ALIAS.webp}`;
const POSTER_JPG = `${MEDIA_BASE}/${HERO_POSTER_ALIAS.jpg}`;

const Layer = styled.div`
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;

  img,
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    /* Mobile crops the sides: the subject is kept in the centre 60% when the clip is cut. */
    object-fit: cover;
    object-position: center;
  }
`;

/**
 * The hero's background: the poster, then the video over it once the config says there is one.
 *
 * The poster is rendered from the first paint, before the config arrives, from the fixed alias
 * index.html preloads — it is the LCP element. If there is no poster (no video uploaded) it
 * hides itself and the hero's gradient shows. The video only mounts when motion is welcome
 * (useHeroVideoAllowed) and pauses while scrolled out of view.
 */
export function HeroVideo({ video }: { video: LandingHeroVideo | null }) {
  const allowed = useHeroVideoAllowed();
  const [posterOk, setPosterOk] = useState(true);
  const ref = useRef<HTMLVideoElement>(null);
  const playing = video !== null && allowed;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // React sets `muted` as a property only; iOS checks it before it will autoplay.
    el.muted = true;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) el.play().catch(() => undefined); // autoplay refused: poster stays
      else el.pause();
    });
    io.observe(el);
    return () => io.disconnect();
  }, [playing, video?.version]);

  return (
    <Layer aria-hidden="true">
      {posterOk && (
        <picture>
          <source srcSet={POSTER_WEBP} type="image/webp" />
          <img src={POSTER_JPG} alt="" decoding="async" onError={() => setPosterOk(false)} />
        </picture>
      )}
      {playing && (
        <video
          key={video.version}
          ref={ref}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster={POSTER_WEBP}
          aria-hidden="true"
        >
          <source
            src={`${MEDIA_BASE}/${video.mobileMp4}`}
            type="video/mp4"
            media="(max-width: 768px)"
          />
          <source src={`${MEDIA_BASE}/${video.webm}`} type="video/webm" />
          <source src={`${MEDIA_BASE}/${video.mp4}`} type="video/mp4" />
        </video>
      )}
    </Layer>
  );
}
