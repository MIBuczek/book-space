import { TestBed } from '@angular/core/testing';
import { ErrorStore } from './error.store';

describe('ErrorStore', () => {
  it('starts with no error', () => {
    expect(TestBed.inject(ErrorStore).serverError()).toBeNull();
  });

  it('records and clears the message', () => {
    const store = TestBed.inject(ErrorStore);
    store.reportServerError('boom');
    expect(store.serverError()).toBe('boom');
    store.clear();
    expect(store.serverError()).toBeNull();
  });
});
