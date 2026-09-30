import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import styled from "styled-components";
import { RefreshCw } from "lucide-react";
import { news } from "../../api/client";
import { NewsCard } from "../../components/news/NewsCard";
import { useMarkNewsSeen } from "../../components/news/useNewsUnread";
import type { Lang, NewsSummary } from "../../components/news/types";

const PAGE_SIZE = 12;

const Container = styled.div`
  max-width: 1100px;
`;

const Title = styled.h1`
  margin: 0 0 24px;
  font-size: 24px;
  color: ${({ theme }) => theme.colors.text};
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 20px;
`;

const Muted = styled.div`
  padding: 32px 0;
  text-align: center;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

const More = styled.button`
  display: block;
  margin: 28px auto 0;
  padding: 10px 22px;
  border-radius: 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }
  &:disabled {
    opacity: 0.5;
    cursor: default;
  }
`;

export function NewsList() {
  const { t, i18n } = useTranslation();
  const lang: Lang = i18n.language === "uz" ? "uz" : "ru";
  const navigate = useNavigate();
  const markSeen = useMarkNewsSeen();
  const [items, setItems] = useState<NewsSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    news
      .feed(page, PAGE_SIZE)
      .then((res) => {
        setItems((prev) => (page === 1 ? res.items : [...prev, ...res.items]));
        setTotal(res.total);
        if (page === 1) markSeen(res.items[0]?.publishedAt);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [page, markSeen]);

  return (
    <Container>
      <Title>{t("news.title")}</Title>

      {error && items.length === 0 ? (
        <Muted>{t("news.loadError")}</Muted>
      ) : !loading && items.length === 0 ? (
        <Muted>{t("news.empty")}</Muted>
      ) : (
        <Grid>
          {items.map((post) => (
            <NewsCard
              key={post.id}
              post={post}
              lang={lang}
              href={`/web/news/${post.slug}`}
              onOpen={(e) => {
                e.preventDefault();
                navigate(`/news/${post.slug}`);
              }}
              detailsLabel={t("news.details")}
            />
          ))}
        </Grid>
      )}

      {loading && (
        <Muted>
          <RefreshCw
            size={16}
            style={{ animation: "spin 1s linear infinite" }}
          />
        </Muted>
      )}

      {!loading && items.length < total && (
        <More type="button" onClick={() => setPage((p) => p + 1)}>
          {t("news.loadMore")}
        </More>
      )}
    </Container>
  );
}
