import { TestBed } from '@angular/core/testing';
import { IUser } from '@models/user.model';
import { SessionStore } from './session.store';

const user: IUser = {
  _id: 'u1',
  email: 'admin@sisk.pl',
  firstName: 'Ada',
  lastName: 'Admin',
  role: 'ADMIN',
  active: true,
};

describe('SessionStore', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
  });

  afterEach(() => localStorage.clear());

  it('starts empty when storage holds nothing', () => {
    const store = TestBed.inject(SessionStore);
    expect(store.token()).toBeNull();
    expect(store.user()).toBeNull();
    expect(store.isAuthenticated()).toBe(false);
    expect(store.role()).toBeNull();
  });

  it('exposes the token, user, role and authenticated flag after set', () => {
    const store = TestBed.inject(SessionStore);
    store.set('token-1', user);

    expect(store.token()).toBe('token-1');
    expect(store.user()).toEqual(user);
    expect(store.role()).toBe('ADMIN');
    expect(store.isAuthenticated()).toBe(true);
  });

  it('persists the session so a reload restores it', () => {
    TestBed.inject(SessionStore).set('token-1', user);

    // A fresh instance is what a reload builds; it must read storage, not
    // share the previous instance's signals.
    const restored = new SessionStore();
    expect(restored.token()).toBe('token-1');
    expect(restored.user()).toEqual(user);
  });

  it('clears both the signals and storage', () => {
    const store = TestBed.inject(SessionStore);
    store.set('token-1', user);
    store.clear();

    expect(store.token()).toBeNull();
    expect(store.user()).toBeNull();
    expect(localStorage.getItem('book-space.token')).toBeNull();
    expect(localStorage.getItem('book-space.user')).toBeNull();
  });

  it('treats a corrupt stored user as no session rather than throwing', () => {
    localStorage.setItem('book-space.token', 'token-1');
    localStorage.setItem('book-space.user', '{not json');

    const store = TestBed.inject(SessionStore);
    expect(store.user()).toBeNull();
    // The token survives, so `isAuthenticated` stays true; the corrupt half is
    // dropped rather than taking the shell down.
    expect(store.token()).toBe('token-1');
  });

  it('survives storage being unavailable', () => {
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });
    const removeItem = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('storage disabled');
    });

    const store = TestBed.inject(SessionStore);
    expect(store.token()).toBeNull();
    expect(() => store.set('t', user)).not.toThrow();
    expect(() => store.clear()).not.toThrow();

    getItem.mockRestore();
    setItem.mockRestore();
    removeItem.mockRestore();
  });
});
