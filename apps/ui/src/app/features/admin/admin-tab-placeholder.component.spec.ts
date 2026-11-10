import { TestBed } from '@angular/core/testing';
import { AdminTabPlaceholderComponent } from './admin-tab-placeholder.component';

describe('AdminTabPlaceholderComponent', () => {
  it('renders the title supplied by the route data', () => {
    const fixture = TestBed.createComponent(AdminTabPlaceholderComponent);
    fixture.componentRef.setInput('title', 'Facilities');
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Facilities');
  });

  it('falls back to a generic heading', () => {
    const fixture = TestBed.createComponent(AdminTabPlaceholderComponent);
    fixture.detectChanges();

    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Administracja');
  });
});
