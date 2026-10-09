import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateProductDto } from './create-product.dto';
import { UpdateProductDto } from './update-product.dto';

// The global ValidationPipe runs with transform: true, i.e. plainToInstance before validate.
describe('product DTOs strip whitespace from mxik', () => {
  it('create: "01905007001000000 " is stored without the space', () => {
    const dto = plainToInstance(CreateProductDto, { mxik: '01905007001000000 ' });
    expect(dto.mxik).toBe('01905007001000000');
  });

  it('update: NBSP and zero-width characters are removed', () => {
    const dto = plainToInstance(UpdateProductDto, { mxik: ' 019050070010​00000' });
    expect(dto.mxik).toBe('01905007001000000');
  });

  it('create: a whitespace-only mxik is empty and still rejected', async () => {
    const dto = plainToInstance(CreateProductDto, { mxik: '   ' });
    const errors = await validate(dto);
    expect(errors.find((e) => e.property === 'mxik')?.constraints).toHaveProperty('isNotEmpty');
  });

  it('update: an absent mxik stays absent', () => {
    const dto = plainToInstance(UpdateProductDto, { nameRu: 'x' });
    expect(dto.mxik).toBeUndefined();
  });
});
