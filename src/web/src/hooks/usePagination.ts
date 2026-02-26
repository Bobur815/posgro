import { useState, useMemo, useCallback, useEffect } from 'react';

interface UsePaginationOptions {
  defaultPageSize?: number;
  pageSizeOptions?: number[];
}

interface UsePaginationResult<T> {
  pageData: T[];
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  pageSizeOptions: number[];
  goToPage: (page: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  setPageSize: (size: number) => void;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  pageOffset: number;
}

export function usePagination<T>(
  data: T[],
  options: UsePaginationOptions = {},
): UsePaginationResult<T> {
  const {
    defaultPageSize = 10,
    pageSizeOptions = [10, 20, 50, 100],
  } = options;

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(defaultPageSize);

  const totalItems = data.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));

  useEffect(() => {
    setCurrentPage(1);
  }, [totalItems]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const pageOffset = (currentPage - 1) * pageSize;

  const pageData = useMemo(() => {
    const start = pageOffset;
    const end = start + pageSize;
    return data.slice(start, end);
  }, [data, pageOffset, pageSize]);

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    setCurrentPage(prev => Math.min(prev + 1, totalPages));
  }, [totalPages]);

  const prevPage = useCallback(() => {
    setCurrentPage(prev => Math.max(prev - 1, 1));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setPageSizeState(size);
    setCurrentPage(1);
  }, []);

  return {
    pageData,
    currentPage,
    pageSize,
    totalPages,
    totalItems,
    pageSizeOptions,
    goToPage,
    nextPage,
    prevPage,
    setPageSize,
    hasNextPage: currentPage < totalPages,
    hasPrevPage: currentPage > 1,
    pageOffset,
  };
}
