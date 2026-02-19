import React from 'react';
import styled from 'styled-components';
import { useTranslation } from 'react-i18next';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
  pageSizeOptions: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

// ─── Styled components ────────────────────────────────────────────────────────

const Bar = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border-top: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.surface};
  flex-shrink: 0;
  gap: ${({ theme }) => theme.spacing.md};
  flex-wrap: wrap;
`;

const Info = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const Controls = styled.div`
  display: flex;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const PageSizeLabel = styled.span`
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  white-space: nowrap;
`;

const PageSizeSelect = styled.select`
  padding: 4px 8px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: 13px;
  cursor: pointer;

  &:focus {
    outline: none;
    border-color: ${({ theme }) => theme.colors.primary};
  }
`;

const NavButton = styled.button<{ $active?: boolean }>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 32px;
  height: 32px;
  padding: 0 6px;
  border: 1px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.primary : theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.background};
  color: ${({ theme, $active }) =>
    $active ? 'white' : theme.colors.text};
  font-size: 13px;
  font-weight: ${({ $active }) => ($active ? '600' : '400')};
  cursor: ${({ $active }) => ($active ? 'default' : 'pointer')};
  transition: all 0.15s;

  &:hover:not(:disabled):not([data-active='true']) {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  &:active:not(:disabled):not([data-active='true']) {
    transform: scale(0.95);
  }
`;

const Ellipsis = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  font-size: 13px;
  color: ${({ theme }) => theme.colors.textSecondary};
  user-select: none;
`;

// ─── Page number generation ───────────────────────────────────────────────────

function buildPageList(current: number, total: number): (number | '...')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, '...', total];
  }
  if (current >= total - 3) {
    return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, '...', current - 1, current, current + 1, '...', total];
}

// ─── Component ────────────────────────────────────────────────────────────────

export function Pagination({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: PaginationProps) {
  const { t } = useTranslation();

  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  const pages = buildPageList(currentPage, totalPages);

  return (
    <Bar>
      <Info>
        {t('pagination.showing', { from, to, total: totalItems })}
      </Info>

      <Controls>
        {/* Prev */}
        <NavButton
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage <= 1}
          aria-label={t('pagination.prev')}
        >
          <ChevronLeft size={15} />
        </NavButton>

        {/* Page numbers */}
        {pages.map((page, i) =>
          page === '...' ? (
            <Ellipsis key={`ellipsis-${i}`}>…</Ellipsis>
          ) : (
            <NavButton
              key={page}
              $active={page === currentPage}
              data-active={page === currentPage}
              onClick={() => page !== currentPage && onPageChange(page as number)}
              aria-current={page === currentPage ? 'page' : undefined}
            >
              {page}
            </NavButton>
          ),
        )}

        {/* Next */}
        <NavButton
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage >= totalPages}
          aria-label={t('pagination.next')}
        >
          <ChevronRight size={15} />
        </NavButton>

        {/* Page size */}
        <PageSizeLabel>{t('pagination.rowsPerPage')}</PageSizeLabel>
        <PageSizeSelect
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
        >
          {pageSizeOptions.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </PageSizeSelect>
      </Controls>
    </Bar>
  );
}
