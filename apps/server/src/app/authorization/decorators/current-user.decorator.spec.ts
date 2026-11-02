import {ExecutionContext} from '@nestjs/common';
import {readCurrentUser} from './current-user.decorator';

const contextFor = (request: {user?: unknown}): ExecutionContext =>
  ({switchToHttp: () => ({getRequest: () => request})}) as unknown as ExecutionContext;

describe('readCurrentUser', () => {
  it('returns the user the auth guard placed on the request', () => {
    const user = {_id: 'user-1', email: 'ada@example.com', role: 'ADMIN'};
    expect(readCurrentUser(contextFor({user}))).toBe(user);
  });

  it('returns undefined when no user is on the request', () => {
    expect(readCurrentUser(contextFor({}))).toBeUndefined();
  });
});
