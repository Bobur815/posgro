import React from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Plus, X } from 'lucide-react';
import { useTabsSelector, getTabLabel } from '../../store/cart-store';

const TabBarContainer = styled.div`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  background-color: ${({ theme }) => theme.colors.surface};
  border-radius: ${({ theme }) => theme.borderRadius};
  box-shadow: ${({ theme }) => theme.shadows.sm};
  overflow-x: auto;
  min-height: 36px;

  &::-webkit-scrollbar {
    height: 2px;
  }
  &::-webkit-scrollbar-thumb {
    background: ${({ theme }) => theme.colors.border};
    border-radius: 2px;
  }
`;

const Tab = styled.button<{ $active?: boolean }>`
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  height: 28px;
  border: 1px solid ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.border};
  border-radius: 6px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.primary + '15' : 'transparent'};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.primary : theme.colors.textSecondary};
  font-size: 15px;
  font-weight: ${({ $active }) => ($active ? 600 : 400)};
  cursor: pointer;
  white-space: nowrap;
  max-width: 180px;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    background-color: ${({ theme }) => theme.colors.primary}10;
  }
`;

const TabLabel = styled.span`
  overflow: hidden;
  text-overflow: ellipsis;
`;

const CloseButton = styled.span`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  flex-shrink: 0;

  &:hover {
    background-color: ${({ theme }) => theme.colors.error}20;
    color: ${({ theme }) => theme.colors.error};
  }
`;

const AddTabButton = styled.button`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px dashed ${({ theme }) => theme.colors.border};
  border-radius: 6px;
  background: transparent;
  color: ${({ theme }) => theme.colors.textSecondary};
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;

  &:hover {
    border-color: ${({ theme }) => theme.colors.primary};
    color: ${({ theme }) => theme.colors.primary};
    background-color: ${({ theme }) => theme.colors.primary}10;
  }
`;

const TabIndex = styled.span`
  font-size: 13px;
  opacity: 0.6;
`;

export function PosTabBar() {
  const { t } = useTranslation();
  const { tabOrder, activeTabId, tabs, addTab, removeTab, setActiveTab } = useTabsSelector();

  const canClose = tabOrder.length > 1;

  return (
    <TabBarContainer>
      {tabOrder.map((tabId, index) => {
        const label = getTabLabel(tabs, tabId);
        const isActive = tabId === activeTabId;

        return (
          <Tab
            key={tabId}
            $active={isActive}
            onClick={() => setActiveTab(tabId)}
            title={label}
          >
            <TabIndex>{index + 1}</TabIndex>
            <TabLabel>{label}</TabLabel>
            {canClose && (
              <CloseButton
                onClick={(e) => {
                  e.stopPropagation();
                  removeTab(tabId);
                }}
              >
                <X size={14} />
              </CloseButton>
            )}
          </Tab>
        );
      })}
      <AddTabButton onClick={() => addTab()} title={t('pos.newTab')}>
        <Plus size={18} />
      </AddTabButton>
    </TabBarContainer>
  );
}
