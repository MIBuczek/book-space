import {findResolvedSlotViolation, resolvedSlotMessage, slotsEqual, ISlot} from './resolved-slots';

/**
 * The resolved-slot immutability rule (FR-018).
 *
 * The rule is pure, so it is driven directly rather than through a service or a request.
 * Each case names the behaviour it pins rather than the implementation: an `INITIAL` slot
 * is editable, a resolved one is not, and the request body is a replacement so a missing
 * resolved slot is a deletion.
 */
const DAY = new Date('2026-03-04T00:00:00.000Z');

const slot = (overrides: Partial<ISlot> = {}): ISlot => ({
  day: DAY,
  startHours: new Date('2026-03-04T08:00:00.000Z'),
  endHours: new Date('2026-03-04T10:00:00.000Z'),
  status: 'INITIAL',
  ...overrides,
});

describe('findResolvedSlotViolation', () => {
  it('allows a replacement that keeps every resolved slot unchanged', () => {
    const stored = [slot({status: 'DONE', participants: 4, comments: 'ok'})];
    const incoming = [slot({status: 'DONE', participants: 4, comments: 'ok'})];

    expect(findResolvedSlotViolation(stored, incoming)).toBeNull();
  });

  it('reports a resolved slot that is absent from the replacement as removed', () => {
    const stored = [slot({status: 'DONE'})];

    expect(findResolvedSlotViolation(stored, [])).toEqual({kind: 'removed', day: DAY});
  });

  it('reports a resolved slot whose hours changed as edited', () => {
    const stored = [slot({status: 'DONE'})];
    const incoming = [slot({status: 'DONE', endHours: new Date('2026-03-04T11:00:00.000Z')})];

    expect(findResolvedSlotViolation(stored, incoming)).toEqual({kind: 'edited', day: DAY});
  });

  it('reports a resolved slot whose day changed as a removal of the old day', () => {
    // The day is the identity. Moving a resolved slot is the old slot disappearing, which
    // is the same as deleting it — and FR-018 forbids that.
    const stored = [slot({status: 'DONE'})];
    const incoming = [slot({status: 'DONE', day: new Date('2026-03-05T00:00:00.000Z')})];

    expect(findResolvedSlotViolation(stored, incoming)).toEqual({kind: 'removed', day: DAY});
  });

  it('refuses to revert a resolved slot to INITIAL', () => {
    // The decision recorded in the module: no override. A revert is an edit like any other.
    const stored = [slot({status: 'CANCELED'})];
    const incoming = [slot({status: 'INITIAL'})];

    expect(findResolvedSlotViolation(stored, incoming)).toEqual({kind: 'edited', day: DAY});
  });

  it('reports a resolved slot whose participants changed as edited', () => {
    const stored = [slot({status: 'DONE', participants: 4})];
    const incoming = [slot({status: 'DONE', participants: 5})];

    expect(findResolvedSlotViolation(stored, incoming)).toEqual({kind: 'edited', day: DAY});
  });

  it('reports a resolved slot whose comments changed as edited', () => {
    const stored = [slot({status: 'DONE', comments: 'first'})];
    const incoming = [slot({status: 'DONE', comments: 'second'})];

    expect(findResolvedSlotViolation(stored, incoming)).toEqual({kind: 'edited', day: DAY});
  });

  it('treats clearing a resolved slot comment as an edit', () => {
    const stored = [slot({status: 'DONE', comments: 'first'})];
    const incoming = [slot({status: 'DONE'})];

    expect(findResolvedSlotViolation(stored, incoming)).toEqual({kind: 'edited', day: DAY});
  });

  it('treats an omitted optional field and an empty one as equal', () => {
    // A client that sends `comments: ''` for an empty comment must not be read as editing
    // a resolved slot, or an innocent round-trip would be refused.
    const stored = [slot({status: 'DONE'})];
    const incoming = [slot({status: 'DONE', comments: ''})];

    expect(findResolvedSlotViolation(stored, incoming)).toBeNull();
  });

  it('allows an INITIAL slot to be edited', () => {
    const stored = [slot()];
    const incoming = [slot({startHours: new Date('2026-03-04T09:00:00.000Z')})];

    expect(findResolvedSlotViolation(stored, incoming)).toBeNull();
  });

  it('allows an INITIAL slot to be removed', () => {
    expect(findResolvedSlotViolation([slot()], [])).toBeNull();
  });

  it('allows a new slot to be added alongside a resolved one', () => {
    const stored = [slot({status: 'DONE'})];
    const incoming = [slot({status: 'DONE'}), slot({day: new Date('2026-03-05T00:00:00.000Z')})];

    expect(findResolvedSlotViolation(stored, incoming)).toBeNull();
  });

  it('checks the resolved slot before an unrelated INITIAL edit', () => {
    // A request that both edits an INITIAL slot and drops a resolved one must be refused;
    // the rule is not "the list is unchanged" but "no resolved slot was touched".
    const resolvedDay = new Date('2026-03-05T00:00:00.000Z');
    const stored = [slot(), slot({day: resolvedDay, status: 'DONE'})];
    const incoming = [slot({startHours: new Date('2026-03-04T09:00:00.000Z')})];

    expect(findResolvedSlotViolation(stored, incoming)).toEqual({kind: 'removed', day: resolvedDay});
  });

  it('reports the first violated resolved slot in stored order', () => {
    const first = slot({status: 'DONE'});
    const second = slot({day: new Date('2026-03-05T00:00:00.000Z'), status: 'CANCELED'});

    expect(findResolvedSlotViolation([first, second], [])).toEqual({kind: 'removed', day: DAY});
  });
});

describe('resolvedSlotMessage', () => {
  it('returns the legacy removal text verbatim', () => {
    expect(resolvedSlotMessage('removed')).toBe('Nie można skasować pola które zostało rozliczone');
  });

  it('returns a distinct edit text', () => {
    expect(resolvedSlotMessage('edited')).toBe('Nie można edytować pola które zostało rozliczone');
  });
});

describe('slotsEqual', () => {
  it('compares dates by instant, not by object identity', () => {
    const one = slot();
    const other = slot();

    expect(one).not.toBe(other);
    expect(slotsEqual(one, other)).toBe(true);
  });
});
