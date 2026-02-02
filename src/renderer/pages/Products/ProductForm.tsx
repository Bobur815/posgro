import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styled from 'styled-components';
import { useProducts } from '../../hooks/useProducts';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';

const Container = styled.div`
  max-width: 600px;
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

const Row = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: ${({ theme }) => theme.spacing.md};
`;

const Actions = styled.div`
  display: flex;
  gap: ${({ theme }) => theme.spacing.md};
  margin-top: ${({ theme }) => theme.spacing.lg};
`;

const Select = styled.select`
  width: 100%;
  padding: ${({ theme }) => theme.spacing.sm};
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.borderRadius};
  background-color: ${({ theme }) => theme.colors.surface};
  color: ${({ theme }) => theme.colors.text};
  font-size: 14px;
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

export function ProductForm() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { id } = useParams();
  const { getById, createProduct, updateProduct, categories, loadCategories, isLoading } =
    useProducts();

  const isEdit = Boolean(id);

  const [formData, setFormData] = useState({
    barcode: '',
    nameRu: '',
    nameUz: '',
    price: '',
    cost: '',
    stock: '0',
    minStock: '0',
    unit: 'шт',
    categoryId: '',
    active: true,
  });

  useEffect(() => {
    loadCategories();

    if (isEdit && id) {
      loadProduct();
    }
  }, [id, isEdit]);

  const loadProduct = async () => {
    if (!id) return;

    const product = await getById(id);
    if (product) {
      setFormData({
        barcode: product.barcode,
        nameRu: product.nameRu,
        nameUz: product.nameUz,
        price: String(product.price),
        cost: product.cost ? String(product.cost) : '',
        stock: String(product.stock),
        minStock: String(product.minStock),
        unit: product.unit,
        categoryId: product.categoryId,
        active: product.active,
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const data = {
      barcode: formData.barcode,
      nameRu: formData.nameRu,
      nameUz: formData.nameUz,
      price: parseFloat(formData.price),
      cost: formData.cost ? parseFloat(formData.cost) : null,
      stock: parseInt(formData.stock),
      minStock: parseInt(formData.minStock),
      unit: formData.unit,
      categoryId: formData.categoryId,
      active: formData.active,
    };

    let success = false;
    if (isEdit && id) {
      success = await updateProduct(id, data);
    } else {
      success = await createProduct(data);
    }

    if (success) {
      navigate('/products');
    }
  };

  const handleChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <Container>
      <Title>{isEdit ? t('products.editProduct') : t('products.addProduct')}</Title>

      <Form onSubmit={handleSubmit}>
        <Input
          label={t('products.barcode')}
          value={formData.barcode}
          onChange={(e) => handleChange('barcode', e.target.value)}
          required
        />

        <Row>
          <Input
            label={t('products.nameRu')}
            value={formData.nameRu}
            onChange={(e) => handleChange('nameRu', e.target.value)}
            required
          />
          <Input
            label={t('products.nameUz')}
            value={formData.nameUz}
            onChange={(e) => handleChange('nameUz', e.target.value)}
            required
          />
        </Row>

        <Row>
          <Input
            label={t('products.price')}
            type="number"
            value={formData.price}
            onChange={(e) => handleChange('price', e.target.value)}
            required
          />
          <Input
            label={t('products.cost')}
            type="number"
            value={formData.cost}
            onChange={(e) => handleChange('cost', e.target.value)}
          />
        </Row>

        <Row>
          <Input
            label={t('products.stock')}
            type="number"
            value={formData.stock}
            onChange={(e) => handleChange('stock', e.target.value)}
          />
          <Input
            label={t('products.minStock')}
            type="number"
            value={formData.minStock}
            onChange={(e) => handleChange('minStock', e.target.value)}
          />
        </Row>

        <Row>
          <Input
            label={t('products.unit')}
            value={formData.unit}
            onChange={(e) => handleChange('unit', e.target.value)}
          />
          <FormGroup>
            <Label>{t('products.category')}</Label>
            <Select
              value={formData.categoryId}
              onChange={(e) => handleChange('categoryId', e.target.value)}
              required
            >
              <option value="">{t('products.selectCategory')}</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.nameRu}
                </option>
              ))}
            </Select>
          </FormGroup>
        </Row>

        <Actions>
          <Button type="button" variant="secondary" onClick={() => navigate('/products')}>
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
