import { useEffect, useState } from "react";
import styled from "styled-components";
import { useLanding } from "../context/LandingContext";
import { fetchNews, MEDIA_ORIGIN } from "../api/news";
import { NewsCard } from "../components/news/NewsCard";
import type { NewsSummary } from "../components/news/types";
import { SectionLede, SectionTitle } from "../components/common/Section";
import { linkTo } from "../router";
import { usePageTitle } from "./usePageTitle";

const PAGE_SIZE = 12;

const Wrap = styled.div`
  padding: 48px 0 72px;
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
  gap: 22px;
`;

const Muted = styled.p`
  padding: 40px 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const More = styled.button`
  display: block;
  margin: 32px auto 0;
  padding: 12px 26px;
  border-radius: 10px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font: inherit;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
`;

export function NewsListPage() {
  const { t, lang } = useLanding();
  const [items, setItems] = useState<NewsSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [state, setState] = useState<"loading" | "ok" | "failed">("loading");
  usePageTitle(t("news.title"));

  useEffect(() => {
    setState("loading");
    fetchNews(page, PAGE_SIZE).then((res) => {
      if (!res) return setState("failed");
      setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
      setTotal(res.total);
      setState("ok");
    });
  }, [page]);

  return (
    <Wrap>
      <SectionTitle as="h1">{t("news.title")}</SectionTitle>
      <SectionLede>{t("news.lede")}</SectionLede>

      {state === "failed" && items.length === 0 && (
        <Muted>{t("news.loadError")}</Muted>
      )}
      {state === "ok" && items.length === 0 && <Muted>{t("news.empty")}</Muted>}

      <Grid>
        {items.map((post) => (
          <NewsCard
            key={post.id}
            post={post}
            lang={lang}
            href={`/news/${post.slug}`}
            onOpen={linkTo(`/news/${post.slug}`)}
            detailsLabel={t("news.details")}
            mediaBase={MEDIA_ORIGIN}
          />
        ))}
      </Grid>

      {state === "loading" && <Muted>…</Muted>}
      {state === "ok" && items.length < total && (
        <More type="button" onClick={() => setPage((p) => p + 1)}>
          {t("news.loadMore")}
        </More>
      )}
    </Wrap>
  );
}
