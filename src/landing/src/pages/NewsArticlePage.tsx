import { useEffect, useState } from "react";
import styled from "styled-components";
import { ArrowLeft } from "lucide-react";
import { useLanding } from "../context/LandingContext";
import { fetchArticle, MEDIA_ORIGIN, type ArticleResult } from "../api/news";
import { ArticleBody } from "../components/news/ArticleBody";
import { formatNewsDate, titleOf } from "../components/news/types";
import { INFO } from "../styles/brand";
import { linkTo } from "../router";
import { usePageTitle } from "./usePageTitle";

/** A reading width: instructions are followed line by line, and long lines lose the reader. */
const Article = styled.article`
  max-width: 760px;
  margin: 0 auto;
  padding: 40px 0 72px;
`;

const Back = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 24px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    color: ${INFO.text};
  }
`;

const DateText = styled.time`
  display: block;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Title = styled.h1`
  margin: 8px 0 24px;
  font-size: clamp(26px, 4vw, 38px);
  line-height: 1.2;
  letter-spacing: -0.02em;
`;

const Cover = styled.img`
  display: block;
  width: 100%;
  height: auto;
  margin-bottom: 28px;
  border-radius: 14px;
`;

const Muted = styled.p`
  padding: 40px 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function NewsArticlePage({ slug }: { slug: string }) {
  const { t, lang } = useLanding();
  const [result, setResult] = useState<ArticleResult | null>(null);
  const post = result?.status === "ok" ? result.post : null;
  usePageTitle(post ? titleOf(post, lang) : t("news.title"));

  useEffect(() => {
    setResult(null);
    fetchArticle(slug).then(setResult);
  }, [slug]);

  return (
    <Article>
      <Back href="/news" onClick={linkTo("/news")}>
        <ArrowLeft size={16} />
        {t("news.back")}
      </Back>

      {!result && <Muted>…</Muted>}
      {result?.status === "missing" && <Muted>{t("news.notFound")}</Muted>}
      {result?.status === "failed" && <Muted>{t("news.loadError")}</Muted>}
      {post && (
        <>
          {post.publishedAt && (
            <DateText dateTime={post.publishedAt}>
              {formatNewsDate(post.publishedAt, lang)}
            </DateText>
          )}
          <Title>{titleOf(post, lang)}</Title>
          {post.coverUrl && <Cover src={MEDIA_ORIGIN + post.coverUrl} alt="" />}
          <ArticleBody
            blocks={post.body}
            lang={lang}
            mediaBase={MEDIA_ORIGIN}
            closeLabel={t("news.close")}
          />
        </>
      )}
    </Article>
  );
}
