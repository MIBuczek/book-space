import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { NotFoundComponent } from './not-found.component';

describe('NotFoundComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [NotFoundComponent],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('says the page does not exist and offers a way back to the calendar', () => {
    const fixture = TestBed.createComponent(NotFoundComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;

    expect(el.textContent).toContain('Strona nie istnieje');
    expect(el.textContent).toContain('Błąd 404');
    const link = el.querySelector('a');
    expect(link?.textContent).toContain('kalendarz');
    expect(link?.getAttribute('href')).toBe('/');
  });
});
