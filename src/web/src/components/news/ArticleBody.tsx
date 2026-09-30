import { useRef, useState } from "react";
import styled from "styled-components";
import { AlertTriangle, Info, X } from "lucide-react";
import { linkify } from "./linkify";
import { pick, type Lang, type NewsBlock } from "./types";

/**
 * A post's body, block by block. Also used by the super admin editor's preview, so what the
 * editor shows is exactly what readers get.
 */

const Body = styled.div`
  display: flex;
  flex-direction: column;
  gap: 18px;
  font-size: 16px;
  line-height: 1.7;
  color: ${({ theme }) => theme.colors.text};

  a {
    color: ${({ theme }) => theme.colors.primary};
    word-break: break-word;
  }
`;

const H2 = styled.h2`
  margin: 14px 0 -4px;
  font-size: 21px;
  line-height: 1.3;
`;

const P = styled.p`
  margin: 0;
  white-space: pre-line;
`;

const Figure = styled.figure`
  margin: 4px 0;

  img {
    display: block;
    width: 100%;
    height: auto;
    border-radius: 10px;
    border: 1px solid ${({ theme }) => theme.colors.border};
    cursor: zoom-in;
  }
  figcaption {
    margin-top: 8px;
    font-size: 13px;
    text-align: center;
    color: ${({ theme }) => theme.colors.textSecondary};
  }
`;

const List = styled.ol`
  margin: 0;
  padding-left: 24px;
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Callout = styled.div<{ $warning: boolean }>`
  display: flex;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 10px;
  border-left: 4px solid
    ${({ theme, $warning }) =>
      $warning ? theme.colors.warning : theme.colors.info};
  background: ${({ theme, $warning }) =>
    `color-mix(in srgb, ${$warning ? theme.colors.warning : theme.colors.info} 10%, transparent)`};

  svg {
    flex: 0 0 auto;
    margin-top: 4px;
    color: ${({ theme, $warning }) =>
      $warning ? theme.colors.warning : theme.colors.info};
  }
  p {
    margin: 0;
    white-space: pre-line;
  }
`;

const Lightbox = styled.dialog`
  max-width: min(1600px, 96vw);
  max-height: 96vh;
  padding: 0;
  border: none;
  background: transparent;

  &::backdrop {
    background: rgba(0, 0, 0, 0.8);
  }
  img {
    display: block;
    max-width: 100%;
    max-height: 92vh;
    border-radius: 8px;
  }
  button {
    position: fixed;
    top: 16px;
    right: 16px;
    display: flex;
    padding: 8px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
    cursor: pointer;
  }
`;

interface Props {
  blocks: NewsBlock[];
  lang: Lang;
  /** Prefix for `/uploads/...` paths; empty when the API is same-origin. */
  mediaBase?: string;
  closeLabel: string;
}

export function ArticleBody({
  blocks,
  lang,
  mediaBase = "",
  closeLabel,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [zoomed, setZoomed] = useState<string | null>(null);

  const zoom = (src: string) => {
    setZoomed(src);
    dialog.current?.showModal();
  };

  return (
    <Body>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "heading":
            return <H2 key={i}>{pick(block.text, lang)}</H2>;
          case "paragraph":
            return <P key={i}>{linkify(pick(block.text, lang))}</P>;
          case "image": {
            const src = mediaBase + block.url;
            const caption = block.caption ? pick(block.caption, lang) : "";
            return (
              <Figure key={i}>
                <img
                  src={src}
                  alt={caption}
                  loading="lazy"
                  onClick={() => zoom(src)}
                />
                {caption && <figcaption>{caption}</figcaption>}
              </Figure>
            );
          }
          case "list": {
            const items = pick(block.items, lang)
              .split("\n")
              .map((s) => s.trim())
              .filter(Boolean);
            return (
              <List key={i} as={block.ordered ? "ol" : "ul"}>
                {items.map((item, j) => (
                  <li key={j}>{linkify(item)}</li>
                ))}
              </List>
            );
          }
          case "callout": {
            const warning = block.tone === "warning";
            const Icon = warning ? AlertTriangle : Info;
            return (
              <Callout key={i} $warning={warning}>
                <Icon size={18} />
                <p>{linkify(pick(block.text, lang))}</p>
              </Callout>
            );
          }
          default:
            return null;
        }
      })}

      <Lightbox
        ref={dialog}
        onClose={() => setZoomed(null)}
        onClick={() => dialog.current?.close()}
      >
        {zoomed && <img src={zoomed} alt="" />}
        <button type="button" aria-label={closeLabel}>
          <X size={22} />
        </button>
      </Lightbox>
    </Body>
  );
}
