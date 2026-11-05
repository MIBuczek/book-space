import {Component, inject, OnInit} from '@angular/core';
import {RouterModule} from '@angular/router';
import {HttpClient} from '@angular/common/http';
import {map, take} from 'rxjs';
import {FacilityDatePipe} from './shared/facility-date.pipe';

@Component({
  standalone: true,
  imports: [RouterModule, FacilityDatePipe],
  selector: 'book-space-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'frontend';
  ocean = '';
  /** Rendered through `FacilityDatePipe` so the shell exercises the shared date-time module. */
  today = new Date();

  private readonly http = inject(HttpClient);

  ngOnInit(): void {
    this.http
      .get<{message: string}>('http://localhost:3000/api')
      .pipe(
        take(1),
        map((cur) => cur.message)
      )
      .subscribe((res) => (this.ocean = res));
  }
}
