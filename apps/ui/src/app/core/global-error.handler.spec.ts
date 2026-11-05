import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { ErrorStore } from './error.store';
import { GlobalErrorHandler } from './global-error.handler';

describe('GlobalErrorHandler', () => {
  let handler: GlobalErrorHandler;
  let navigate: jest.SpyInstance;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    handler = TestBed.inject(GlobalErrorHandler);
    navigate = jest.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
  });

  it('records an Error message and shows the server-error page', () => {
    handler.handleError(new Error('kaboom'));

    expect(TestBed.inject(ErrorStore).serverError()).toBe('kaboom');
    expect(navigate).toHaveBeenCalledWith(['/server-error']);
  });

  it('falls back to a generic message for a non-Error throw', () => {
    handler.handleError('a string');

    expect(TestBed.inject(ErrorStore).serverError()).toBe('An unexpected error occurred.');
    expect(navigate).toHaveBeenCalledWith(['/server-error']);
  });
});
