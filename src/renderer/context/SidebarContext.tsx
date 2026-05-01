import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface SidebarContextType {
  isCollapsed: boolean;
  toggleSidebar: () => void;
  collapseSidebar: () => void;
  expandSidebar: () => void;
  smenaOpen: boolean;
  openSmenaModal: () => void;
  closeSmenaModal: () => void;
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [smenaOpen, setSmenaOpen] = useState(false);

  const toggleSidebar = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const collapseSidebar = useCallback(() => {
    setIsCollapsed(true);
  }, []);

  const expandSidebar = useCallback(() => {
    setIsCollapsed(false);
  }, []);

  const openSmenaModal = useCallback(() => setSmenaOpen(true), []);
  const closeSmenaModal = useCallback(() => setSmenaOpen(false), []);

  return (
    <SidebarContext.Provider
      value={{ isCollapsed, toggleSidebar, collapseSidebar, expandSidebar, smenaOpen, openSmenaModal, closeSmenaModal }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error('useSidebar must be used within a SidebarProvider');
  }
  return context;
}
