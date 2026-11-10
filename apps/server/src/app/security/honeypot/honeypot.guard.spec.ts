import {ExecutionContext, UnprocessableEntityException} from '@nestjs/common';
import {HONEYPOT_FIELD, HoneypotGuard} from './honeypot.guard';

const contextFor = (body: Record<string, unknown>): ExecutionContext =>
  ({switchToHttp: () => ({getRequest: () => ({body})})}) as unknown as ExecutionContext;

describe('HoneypotGuard', () => {
  const guard = new HoneypotGuard();

  it('lets a submission through when the decoy is absent', () => {
    expect(guard.canActivate(contextFor({person: 'Anna'}))).toBe(true);
  });

  it('lets a submission through when the decoy is an empty string', () => {
    expect(guard.canActivate(contextFor({[HONEYPOT_FIELD]: ''}))).toBe(true);
    expect(guard.canActivate(contextFor({[HONEYPOT_FIELD]: '   '}))).toBe(true);
  });

  it('refuses a submission that filled the decoy field', () => {
    expect(() => guard.canActivate(contextFor({[HONEYPOT_FIELD]: 'http://spam.example'}))).toThrow(
      UnprocessableEntityException
    );
  });
});
