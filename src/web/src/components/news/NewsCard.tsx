import styled from "styled-components";
import { ArrowRight, Newspaper } from "lucide-react";
import {
  excerptOf,
  formatNewsDate,
  titleOf,
  type Lang,
  type NewsSummary,
} from "./types";

const Card = styled.article`
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-radius: 12px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  transition:
    box-shadow 150ms ease,
    transform 150ms ease;

  &:hover {
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.1);
    transform: translateY(-2px);
  }
`;

/** 16:9 whatever was uploaded, so a grid of cards lines up. */
const Cover = styled.div`
  aspect-ratio: 16 / 9;
  background: ${({ theme }) => theme.colors.background};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${({ theme }) => theme.colors.textSecondary};

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

const Content = styled.div`
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px 20px 20px;
`;

const DateText = styled.time`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Title = styled.h3`
  margin: 0;
  font-size: 17px;
  line-height: 1.35;
  color: ${({ theme }) => theme.colors.text};
`;

const Excerpt = styled.p`
  margin: 0;
  font-size: 14px;
  line-height: 1.55;
  color: ${({ theme }) => theme.colors.textSecondary};
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
`;

const Details = styled.a`
  align-self: flex-start;
  margin-top: auto;
  padding-top: 8px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.primary};

  &:hover svg {
    transform: translateX(3px);
  }
  svg {
    transition: transform 150ms ease;
  }
`;

interface Props {
  post: NewsSummary;
  lang: Lang;
  href: string;
  /** Client-side navigation; the href still works for middle-click and "open in new tab". */
  onOpen: (e: React.MouseEvent) => void;
  detailsLabel: string;
  mediaBase?: string;
}

export function NewsCard({
  post,
  lang,
  href,
  onOpen,
  detailsLabel,
  mediaBase = "",
}: Props) {
  const title = titleOf(post, lang);
  const excerpt = excerptOf(post, lang);

  return (
    <Card>
      <Cover>
        {post.coverUrl ? (
          <img src={mediaBase + post.coverUrl} alt="" loading="lazy" />
        ) : (
          <Newspaper size={36} />
        )}
      </Cover>
      <Content>
        {post.publishedAt && (
          <DateText dateTime={post.publishedAt}>
            {formatNewsDate(post.publishedAt, lang)}
          </DateText>
        )}
        <Title>{title}</Title>
        {excerpt && <Excerpt>{excerpt}</Excerpt>}
        <Details href={href} onClick={onOpen}>
          {detailsLabel}
          <ArrowRight size={15} />
        </Details>
      </Content>
    </Card>
  );
}
