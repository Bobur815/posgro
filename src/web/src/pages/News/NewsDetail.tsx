import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import styled from "styled-components";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { news } from "../../api/client";
import { ArticleBody } from "../../components/news/ArticleBody";
import {
  formatNewsDate,
  titleOf,
  type Lang,
  type NewsArticle,
} from "../../components/news/types";

/** A reading width, not the page width: long lines of instructions are hard to follow. */
const Container = styled.article`
  max-width: 760px;
`;

const Back = styled(Link)`
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 20px;
  font-size: 14px;
  font-weight: 600;
  text-decoration: none;
  color: ${({ theme }) => theme.colors.textSecondary};
  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const DateText = styled.time`
  display: block;
  font-size: 14px;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const Title = styled.h1`
  margin: 6px 0 20px;
  font-size: clamp(24px, 3vw, 32px);
  line-height: 1.25;
  color: ${({ theme }) => theme.colors.text};
`;

const Cover = styled.img`
  display: block;
  width: 100%;
  height: auto;
  margin-bottom: 24px;
  border-radius: 12px;
`;

const Muted = styled.div`
  padding: 32px 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export function NewsDetail() {
  const { slug = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language === "uz" ? "uz" : "ru";
  const [post, setPost] = useState<NewsArticle | null>(null);
  const [state, setState] = useState<"loading" | "ok" | "missing">("loading");

  useEffect(() => {
    setState("loading");
    news
      .article(slug)
      .then((p) => {
        setPost(p);
        setState("ok");
        window.scrollTo(0, 0);
      })
      .catch(() => setState("missing"));
  }, [slug]);

  return (
    <Container>
      <Back to="/news">
        <ArrowLeft size={16} />
        {t("news.back")}
      </Back>

      {state === "loading" && (
        <Muted>
          <RefreshCw
            size={16}
            style={{ animation: "spin 1s linear infinite" }}
          />
        </Muted>
      )}
      {state === "missing" && <Muted>{t("news.notFound")}</Muted>}
      {state === "ok" && post && (
        <>
          {post.publishedAt && (
            <DateText dateTime={post.publishedAt}>
              {formatNewsDate(post.publishedAt, lang)}
            </DateText>
          )}
          <Title>{titleOf(post, lang)}</Title>
          {post.coverUrl && <Cover src={post.coverUrl} alt="" />}
          <ArticleBody
            blocks={post.body}
            lang={lang}
            closeLabel={t("news.close")}
          />
        </>
      )}
    </Container>
  );
}
