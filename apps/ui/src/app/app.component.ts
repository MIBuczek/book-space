import {Component, OnInit} from '@angular/core';
import {RouterModule} from '@angular/router';
import {HttpClient, HttpClientModule} from '@angular/common/http';
import {map, take} from 'rxjs';

@Component({
  standalone: true,
  imports: [RouterModule, HttpClientModule],
  selector: 'book-space-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'frontend';
  ocean = '';

  constructor(private readonly http: HttpClient) {}

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
