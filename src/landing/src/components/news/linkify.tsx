import { Fragment, type ReactNode } from "react";

const URL_RE = /(https?:\/\/[^\s<>"']+[^\s<>"'.,;:!?)\]])/g;

/**
 * Plain text with its http(s) links made clickable — the only markup a post body gets. Everything
 * else stays a text node, so a stored post can never inject HTML.
 */
export function linkify(text: string): ReactNode {
  return text.split(URL_RE).map((part, i) =>
    i % 2 === 1 ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer">
        {part}
      </a>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    ),
  );
}
