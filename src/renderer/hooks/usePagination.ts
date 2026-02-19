import { useState, useMemo, useCallback, useEffect } from 'react';

interface UsePaginationOptions {
  defaultPageSize?: number;
  pageSizeOptions?: number[];
}

interface UsePaginationResult<T> {
  /** Current page data slice */
  pageData: T[];
  /** Current page number (1-based) */
  currentPage: number;
  /** Items per page */
  pageSize: number;
  /** Total number of pages */
  totalPages: number;
  /** Total number of items */
  totalItems: number;
  /** Available page size options */
  pageSizeOptions: number[];
  /** Go to specific page */
  goToPage: (page: number) => void;
  /** Go to next page */
  nextPage: () => void;
  /** Go to previous page */
  prevPage: () => void;
  /** Change page size */
  setPageSize: (size: number) => void;
  /** Whether there is a next page */
  hasNextPage: boolean;
  /** Whether there is a previous page */
  hasPrevPage: boolean;
  /** Index offset for row numbering (0-based start of current page) */
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

  // Reset to page 1 when data changes significantly (filters, search)
  useEffect(() => {
    setCurrentPage(1);
  }, [totalItems]);

  // Clamp current page if it exceeds total pages
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
