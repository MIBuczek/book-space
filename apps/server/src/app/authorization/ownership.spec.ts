import {ownsRecord, canModifyBooking} from './ownership';

describe('ownsRecord', () => {
  it('treats an identical identity as owned', () => {
    expect(ownsRecord('user-1', 'user-1')).toBe(true);
  });

  it('compares an e-mail identity case-insensitively and ignoring surrounding space', () => {
    expect(ownsRecord('  Ada@Example.com ', 'ada@example.com')).toBe(true);
  });

  it('does not treat a different identity as owned', () => {
    expect(ownsRecord('user-1', 'user-2')).toBe(false);
  });

  it('does not treat a prefix as owned', () => {
    // The legacy check was `createdBy.includes(email)`, so `ada@example.com`
    // owned a record created by `ada@example.com.attacker`.
    expect(ownsRecord('ada@example.com.attacker', 'ada@example.com')).toBe(false);
  });

  it('does not treat a missing creator identity as owned by anyone', () => {
    expect(ownsRecord(undefined, 'user-1')).toBe(false);
    expect(ownsRecord(null, 'user-1')).toBe(false);
    expect(ownsRecord('', 'user-1')).toBe(false);
    expect(ownsRecord('   ', 'user-1')).toBe(false);
  });

  it('does not treat a missing actor identity as owning anything', () => {
    expect(ownsRecord('user-1', undefined)).toBe(false);
    expect(ownsRecord('user-1', null)).toBe(false);
    expect(ownsRecord('user-1', '')).toBe(false);
  });

  it('does not treat two empty identities as a match', () => {
    // `''.includes('')` is true, which is how the legacy check let an
    // unidentified caller act on every record.
    expect(ownsRecord('', '')).toBe(false);
  });
});

describe('canModifyBooking', () => {
  const booking = {createdBy: 'user-1'};

  it('lets an administrator modify a booking they did not create', () => {
    expect(canModifyBooking({role: 'ADMIN', _id: 'user-9'}, booking)).toBe(true);
  });

  it('lets a staff member modify a booking they created', () => {
    expect(canModifyBooking({role: 'EMPLOYEE', _id: 'user-1'}, booking)).toBe(true);
    expect(canModifyBooking({role: 'OFFICE', _id: 'user-1'}, booking)).toBe(true);
  });

  it('stops a staff member modifying another staff member\'s booking', () => {
    expect(canModifyBooking({role: 'EMPLOYEE', _id: 'user-2'}, booking)).toBe(false);
    expect(canModifyBooking({role: 'OFFICE', _id: 'user-2'}, booking)).toBe(false);
  });

  it('matches on e-mail when the actor has no id', () => {
    expect(canModifyBooking({role: 'EMPLOYEE', email: 'ada@example.com'}, {createdBy: 'ADA@example.com'})).toBe(true);
  });

  it('does not treat a booking with no creator as owned by a staff member', () => {
    expect(canModifyBooking({role: 'EMPLOYEE', _id: 'user-1'}, {createdBy: undefined})).toBe(false);
  });

  it('does not treat an unauthenticated actor as an owner', () => {
    expect(canModifyBooking(undefined, booking)).toBe(false);
    expect(canModifyBooking({role: 'EMPLOYEE'}, booking)).toBe(false);
  });

  it('matches when the actor id is an ObjectId rather than a string', () => {
    // The id on a real request is a hydrated document's `ObjectId`, not the `string`
    // the interface declares. Reading it without conversion made the record's own
    // creator look like a non-owner.
    const objectId = {toString: () => 'user-1'};
    expect(canModifyBooking({role: 'EMPLOYEE', _id: objectId as unknown as string}, booking)).toBe(true);
  });

  it('does not treat a missing booking as owned by anyone', () => {
    expect(canModifyBooking({role: 'ADMIN', _id: 'user-1'}, null)).toBe(false);
    expect(canModifyBooking({role: 'ADMIN', _id: 'user-1'}, undefined)).toBe(false);
  });
});
