import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Modal } from '../../components/common/Modal';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { useToast } from '../../context/ToastContext';
import { Category } from '@shared/types';
import { convertUzbekText } from '@shared/utils/transliterator';
import { Pencil, Trash2, Plus, ArrowLeft } from 'lucide-react';

const List = styled.div`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.sm};
`;

const CategoryRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: ${({ theme }) => theme.spacing.sm} ${({ theme }) => theme.spacing.md};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.background};
`;

const CategoryInfo = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
`;

const CategoryName = styled.span`
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const RowActions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.xs};
`;

const IconButton = styled.button<{ $variant?: 'danger' }>`
  background: none;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  padding: 6px;
  cursor: pointer;
  color: ${({ theme, $variant }) =>
    $variant === 'danger' ? theme.colors.error : theme.colors.textSecondary};
  display: flex;
  align-items: center;

  &:hover {
    background-color: ${({ theme, $variant }) =>
      $variant === 'danger' ? theme.colors.error + '10' : theme.colors.background};
  }
`;

const TopBar = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.md};
`;

const BackButton = styled.button`
  background: none;
  border: none;
  color: ${({ theme }) => theme.colors.primary};
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0;
  font-size: 14px;

  &:hover {
    text-decoration: underline;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  justify-content: flex-end;
  margin-top: ${({ theme }) => theme.spacing.sm};
`;

const EmptyMessage = styled.div`
  text-align: center;
  padding: ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.textSecondary};
`;

interface CategoryManagementModalProps {
  onClose: () => void;
  onCategoryChanged: () => void;
}

type View = 'list' | 'form';

export function CategoryManagementModal({
  onClose,
  onCategoryChanged,
}: CategoryManagementModalProps) {
  const { t, i18n } = useTranslation();
  const toast = useToast();

  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [view, setView] = useState<View>('list');
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [categoryToDelete, setCategoryToDelete] = useState<Category | null>(null);
  const [formData, setFormData] = useState({
    nameRu: '',
    nameUz: '',
  });

  const loadCategories = async () => {
    try {
      const data = await window.electronAPI.categories.getAll();
      setCategories(data as Category[]);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  useEffect(() => {
    loadCategories();
  }, []);

  const openCreateForm = () => {
    setEditingCategory(null);
    setFormData({ nameRu: '', nameUz: '' });
    setView('form');
  };

  const openEditForm = (category: Category) => {
    setEditingCategory(category);
    setFormData({
      nameRu: category.nameRu,
      nameUz: category.nameUz,
    });
    setView('form');
  };

  const handleNameUzChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameUz: value,
        nameRu:
          prev.nameRu === '' || prev.nameRu === convertUzbekText(prev.nameUz)
            ? converted
            : prev.nameRu,
      };
    });
  };

  const handleNameRuChange = (value: string) => {
    setFormData((prev) => {
      const converted = convertUzbekText(value);
      return {
        ...prev,
        nameRu: value,
        nameUz:
          prev.nameUz === '' || prev.nameUz === convertUzbekText(prev.nameRu)
            ? converted
            : prev.nameUz,
      };
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      if (editingCategory) {
        await window.electronAPI.categories.update(String(editingCategory.id), formData);
        toast.success(t('categories.categoryUpdated'));
      } else {
        await window.electronAPI.categories.create(formData);
        toast.success(t('categories.categoryCreated'));
      }

      await loadCategories();
      onCategoryChanged();
      setView('list');
    } catch (err) {
      toast.error(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!categoryToDelete) return;
    setIsLoading(true);

    try {
      await window.electronAPI.categories.delete(String(categoryToDelete.id));
      toast.success(t('categories.categoryDeleted'));
      await loadCategories();
      onCategoryChanged();
      setCategoryToDelete(null);
    } catch (err) {
      toast.error(t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryName = (category: Category) =>
    i18n.language === 'uz' ? category.nameUz : category.nameRu;

  const title =
    view === 'form'
      ? editingCategory
        ? t('products.editCategory')
        : t('products.addCategory')
      : t('categories.title');

  return (
    <>
      <Modal title={title} onClose={onClose} width="500px">
        {view === 'list' ? (
          <>
            <TopBar>
              <div />
              <Button size="small" onClick={openCreateForm}>
                <Plus size={16} /> {t('products.addCategory')}
              </Button>
            </TopBar>
            <List>
              {categories.length === 0 ? (
                <EmptyMessage>{t('products.noCategories')}</EmptyMessage>
              ) : (
                categories.map((category) => (
                  <CategoryRow key={category.id}>
                    <CategoryInfo>
                      <CategoryName>{getCategoryName(category)}</CategoryName>
                    </CategoryInfo>
                    <RowActions>
                      <IconButton onClick={() => openEditForm(category)}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton
                        $variant="danger"
                        onClick={() => setCategoryToDelete(category)}
                      >
                        <Trash2 size={14} />
                      </IconButton>
                    </RowActions>
                  </CategoryRow>
                ))
              )}
            </List>
          </>
        ) : (
          <>
            <BackButton onClick={() => setView('list')}>
              <ArrowLeft size={14} /> {t('categories.title')}
            </BackButton>
            <Form onSubmit={handleSubmit}>
              <Input
                label={t('categories.nameUz')}
                value={formData.nameUz}
                onChange={(e) => handleNameUzChange(e.target.value)}
                required
                autoFocus
              />
              <Input
                label={t('categories.nameRu')}
                value={formData.nameRu}
                onChange={(e) => handleNameRuChange(e.target.value)}
                required
              />
              <Actions>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setView('list')}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  type="submit"
                  disabled={isLoading || !formData.nameRu || !formData.nameUz}
                >
                  {isLoading ? t('common.saving') : t('common.save')}
                </Button>
              </Actions>
            </Form>
          </>
        )}
      </Modal>

      {categoryToDelete && (
        <ConfirmDialog
          title={t('common.delete')}
          message={t('categories.confirmDelete')}
          confirmLabel={t('common.delete')}
          cancelLabel={t('common.cancel')}
          variant="danger"
          onConfirm={handleDelete}
          onCancel={() => setCategoryToDelete(null)}
        />
      )}
    </>
  );
}
