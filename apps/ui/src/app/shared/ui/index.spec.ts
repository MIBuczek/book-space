import * as kit from './index';

// The barrel is the kit's public surface. A missing export is a broken import
// for a feature, so each name is asserted individually rather than by count.
describe('UI kit barrel', () => {
  it('exports every kit control', () => {
    expect(Object.keys(kit).sort()).toEqual([
      'ButtonComponent',
      'CheckboxComponent',
      'DatePickerComponent',
      'InputComponent',
      'ModalComponent',
      'MonthPickerComponent',
      'PaginationComponent',
      'SelectComponent',
      'TableComponent',
    ]);
  });

  it('resolves each export to a class', () => {
    for (const name of Object.keys(kit)) {
      expect(typeof kit[name as keyof typeof kit]).toBe('function');
    }
  });
});
