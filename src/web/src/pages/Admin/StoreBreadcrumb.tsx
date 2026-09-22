import React from "react";
import styled from "styled-components";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

/**
 * The title of the store pages, as a trail back to the list:
 * Stores › Create, Stores › [store name], Stores › [store name] › Edit.
 * Every crumb but the last is a link.
 */

const Trail = styled.h1`
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  font-size: 28px;
  color: ${({ theme }) => theme.colors.text};
  min-width: 0;

  @media (max-width: 600px) {
    font-size: 22px;
  }
`;

const Crumb = styled(Link)`
  color: ${({ theme }) => theme.colors.textSecondary};
  text-decoration: none;

  &:hover {
    color: ${({ theme }) => theme.colors.primary};
  }
`;

const Current = styled.span`
  overflow-wrap: anywhere;
`;

const Separator = styled(ChevronRight)`
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.textSecondary};
`;

export interface CrumbItem {
  label: string;
  /** A route to link to; the last crumb is the page itself and never links. */
  to?: string;
}

export function StoreBreadcrumb({ items }: { items: CrumbItem[] }) {
  const all: CrumbItem[] = [{ label: "Stores", to: "/admin/stores" }, ...items];
  return (
    <Trail>
      {all.map((item, i) => {
        const last = i === all.length - 1;
        return (
          <React.Fragment key={`${i}-${item.label}`}>
            {i > 0 && <Separator size={22} aria-hidden />}
            {last || !item.to ? (
              <Current aria-current={last ? "page" : undefined}>{item.label}</Current>
            ) : (
              <Crumb to={item.to}>{item.label}</Crumb>
            )}
          </React.Fragment>
        );
      })}
    </Trail>
  );
}
