import { TestBed } from '@angular/core/testing';
import { CookieNoticeStore } from './cookie-notice.store';

const KEY = 'book-space.cookies-acknowledged';

describe('CookieNoticeStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  it('starts unacknowledged when nothing is stored', () => {
    expect(TestBed.inject(CookieNoticeStore).acknowledged()).toBe(false);
  });

  it('records the acknowledgement in storage', () => {
    const store = TestBed.inject(CookieNoticeStore);
    store.acknowledge();

    expect(store.acknowledged()).toBe(true);
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('reads a stored acknowledgement on construction', () => {
    localStorage.setItem(KEY, 'true');
    expect(TestBed.inject(CookieNoticeStore).acknowledged()).toBe(true);
  });

  it('does not treat an unrelated stored value as acknowledged', () => {
    // The legacy wrote `'false'` here, which is a non-empty string and so read as
    // acknowledged by its `if (!value)` test. An equality check cannot do that.
    localStorage.setItem(KEY, 'false');
    expect(TestBed.inject(CookieNoticeStore).acknowledged()).toBe(false);
  });

  it('survives storage that throws on read', () => {
    const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    try {
      expect(TestBed.inject(CookieNoticeStore).acknowledged()).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });

  it('survives storage that throws on write', () => {
    const store = TestBed.inject(CookieNoticeStore);
    const spy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    try {
      store.acknowledge();
      expect(store.acknowledged()).toBe(true);
    } finally {
      spy.mockRestore();
    }
  });
});
