import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PaginationComponent } from './pagination.component';

@Component({
  imports: [PaginationComponent],
  template: `<book-space-pagination
    [page]="page"
    [total]="total"
    [limit]="limit"
    (pageChange)="onChange($event)"
  />`,
})
class HostComponent {
  page = 1;
  total = 100;
  limit = 10;
  selected = 0;
  onChange(page: number): void {
    this.selected = page;
  }
}

describe('PaginationComponent', () => {
  const create = async () => {
    await TestBed.configureTestingModule({ imports: [HostComponent] }).compileComponents();
    return TestBed.createComponent(HostComponent);
  };

  const buttons = (fixture: {nativeElement: HTMLElement}) =>
    Array.from(fixture.nativeElement.querySelectorAll('button')) as HTMLButtonElement[];

  it('derives the page count from the total and the limit', async () => {
    const fixture = await create();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Page 1 of 10');
    expect(buttons(fixture)[0].disabled).toBe(true);
    expect(buttons(fixture)[1].disabled).toBe(false);
  });

  it('emits the next page and the previous page', async () => {
    const fixture = await create();
    fixture.componentInstance.page = 5;
    fixture.detectChanges();

    buttons(fixture)[1].click();
    expect(fixture.componentInstance.selected).toBe(6);

    buttons(fixture)[0].click();
    expect(fixture.componentInstance.selected).toBe(4);
  });

  it('rounds a partial last page up', async () => {
    const fixture = await create();
    fixture.componentInstance.total = 101;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Page 1 of 11');
  });

  it('never reports fewer than one page', async () => {
    const fixture = await create();
    fixture.componentInstance.total = 0;
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Page 1 of 1');
  });

  it('ignores a page outside the valid range', async () => {
    const fixture = await create();
    fixture.detectChanges();
    const component = fixture.debugElement.children[0].componentInstance as {
      goTo(page: number): void;
    };

    component.goTo(0);
    component.goTo(999);

    expect(fixture.componentInstance.selected).toBe(0);
  });

  it('disables next on the last page', async () => {
    const fixture = await create();
    fixture.componentInstance.page = 10;
    fixture.detectChanges();

    expect(buttons(fixture)[1].disabled).toBe(true);
  });
});
