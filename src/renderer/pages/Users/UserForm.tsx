import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

const Container = styled.div`
  max-width: 500px;
`;

const Title = styled.h1`
  margin: 0 0 ${({ theme }) => theme.spacing.lg};
  color: ${({ theme }) => theme.colors.text};
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Select = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
`;

const Label = styled.label`
  display: block;
  margin-bottom: ${({ theme }) => theme.spacing.xs};
  font-weight: 500;
  color: ${({ theme }) => theme.colors.text};
`;

const FormGroup = styled.div`
  display: flex;
  flex-direction: column;
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const ErrorMessage = styled.div`
  color: ${({ theme }) => theme.colors.error};
  font-size: 14px;
`;

export function UserForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const isEdit = Boolean(id);

  const [formData, setFormData] = useState({
    username: '',
    password: '',
    nameRu: '',
    nameUz: '',
    role: 'USER',
  });
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isEdit && id) {
      loadUser();
    }
  }, [id, isEdit]);

  const loadUser = async () => {
    try {
      const users = await window.electronAPI.users.getAll();
      const user = (users as Array<{
        id: string;
        username: string;
        nameRu: string;
        nameUz: string;
        role: string;
      }>).find((u) => u.id === id);

      if (user) {
        setFormData({
          username: user.username,
          password: '',
          nameRu: user.nameRu,
          nameUz: user.nameUz,
          role: user.role,
        });
      }
    } catch (error) {
      console.error('Failed to load user:', error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (isEdit && id) {
        const updateData: Record<string, string> = {
          nameRu: formData.nameRu,
          nameUz: formData.nameUz,
          role: formData.role,
        };

        if (formData.password) {
          updateData.password = formData.password;
        }

        await window.electronAPI.users.update(id, updateData);
      } else {
        if (!formData.password) {
          setError(t('users.passwordRequired'));
          setIsLoading(false);
          return;
        }

        await window.electronAPI.users.create(formData);
      }

      navigate('/users');
    } catch (error) {
      setError(error instanceof Error ? error.message : t('common.error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Container>
      <Title>{isEdit ? t('users.editUser') : t('users.addUser')}</Title>

      <Form onSubmit={handleSubmit}>
        <Input
          label={t('users.username')}
          value={formData.username}
          onChange={(e) => handleChange('username', e.target.value)}
          disabled={isEdit}
          required
        />

        <Input
          label={isEdit ? t('users.newPassword') : t('users.password')}
          type="password"
          value={formData.password}
          onChange={(e) => handleChange('password', e.target.value)}
          required={!isEdit}
          placeholder={isEdit ? t('users.leaveBlankToKeep') : ''}
        />

        <Input
          label={t('users.nameRu')}
          value={formData.nameRu}
          onChange={(e) => handleChange('nameRu', e.target.value)}
          required
        />

        <Input
          label={t('users.nameUz')}
          value={formData.nameUz}
          onChange={(e) => handleChange('nameUz', e.target.value)}
          required
        />

        <FormGroup>
          <Label>{t('users.role')}</Label>
          <Select
            value={formData.role}
            onChange={(e) => handleChange('role', e.target.value)}
          >
            <option value="USER">{t('users.cashier')}</option>
            <option value="ADMIN">{t('users.admin')}</option>
          </Select>
        </FormGroup>

        {error && <ErrorMessage>{error}</ErrorMessage>}

        <Actions>
          <Button type="button" variant="secondary" onClick={() => navigate('/users')}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={isLoading}>
            {isLoading ? t('common.saving') : t('common.save')}
          </Button>
        </Actions>
      </Form>
    </Container>
  );
}
