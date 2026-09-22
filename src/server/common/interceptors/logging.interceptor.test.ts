import { of } from 'rxjs';
import { LoggingInterceptor } from './logging.interceptor';

function logged(body: Record<string, unknown>) {
  const log = jest.spyOn(console, 'log').mockImplementation(() => {});
  const context = {
    switchToHttp: () => ({ getRequest: () => ({ method: 'PATCH', url: '/api/stores/1000', body }) }),
  };
  new LoggingInterceptor().intercept(context as never, { handle: () => of(null) });
  const [, meta] = log.mock.calls[0] as [string, { body: Record<string, unknown> }];
  log.mockRestore();
  return meta.body;
}

describe('LoggingInterceptor', () => {
  // The staging log carried a super-admin password in plain text.
  it('redacts every password-like field, not only one named "password"', () => {
    expect(
      logged({ superAdminPassword: '1234', currentPassword: 'a', newPassword: 'b', password: 'c', pin: '0000', license: 'x.y' }),
    ).toEqual({
      superAdminPassword: '[REDACTED]',
      currentPassword: '[REDACTED]',
      newPassword: '[REDACTED]',
      password: '[REDACTED]',
      pin: '[REDACTED]',
      license: '[REDACTED]',
    });
  });

  it('keeps the rest, and an empty value that says the field was cleared', () => {
    expect(logged({ mode: 'OFFLINE_ONLY', superAdminPassword: '' })).toEqual({
      mode: 'OFFLINE_ONLY',
      superAdminPassword: '',
    });
  });
});
