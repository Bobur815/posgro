import { VcrError } from './regos-vcr-client';
import { isProductRejection } from './product-validity';

jest.mock('../logger', () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock('../database/sqlite-client', () => ({ getPrismaClient: () => ({}) }));

/** Which REGOS rejections are about a product's own data — and so may mark it invalid. */
const rejection = (code: number, description: string) => new VcrError(code, description, 'Receipt.Sale');

describe('isProductRejection', () => {
  it.each([
    [701003, 'Ставка НДС не найдена'],
    [701003, 'Некорректный ИКПУ товара'],
    [705511, 'Ошибка проверки'],
    [701003, 'Неверный код упаковки'],
    [701003, 'Код маркировки недействителен'],
    [701003, 'Товар выведен из оборота'],
  ])('blames the product for [%i] %s', (code, text) => {
    expect(isProductRejection(rejection(code, text))).toBe(true);
  });

  it.each([
    [701003, 'Некорректные входные данные (Код обязательной маркировки не задан)'],
    [701003, 'Дубликат кода маркировки'],
    [0, 'ECONNREFUSED'],
    [704010, 'Z-отчёт не открыт'],
    [705000, 'Неверный логин или пароль кассира'],
    [701003, 'Некорректные входные данные'],
  ])('does not blame the product for [%i] %s', (code, text) => {
    expect(isProductRejection(rejection(code, text))).toBe(false);
  });

  it('is false for anything that is not a VCR error', () => {
    expect(isProductRejection(new Error('boom'))).toBe(false);
  });
});
