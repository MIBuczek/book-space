import {Injectable} from '@angular/core';

/**
 * The two browser side-effects the Summary tab needs: save a file and open the print dialog.
 *
 * They are in a service rather than in the component so the component stays about state and the
 * side-effects are stubbed in one place. Both are thin wrappers over browser APIs; the reason to
 * have them at all is that a component calling `window.print()` directly is untestable without
 * spying on a global, and a component building a download anchor inline hides the one thing that
 * can go wrong (a forgotten `revokeObjectURL`, which leaks the blob for the tab's lifetime).
 *
 * The print path is the rewrite's answer to the legacy `PreviewPDF.tsx` (FR-030, T028): instead
 * of opening a new window at a hardcoded production URL, the report is rendered in the page and
 * the browser prints it. `styles.scss` carries the print stylesheet that hides everything but
 * the element marked `bs-printable`, so there is no popup to be blocked and no deployment URL to
 * depend on.
 */
@Injectable({providedIn: 'root'})
export class ReportExport {
  /**
   * Saves `content` as `filename`.
   *
   * A `Blob` + object URL rather than a `data:` URI: the CSV is potentially large and a data URI
   * has a length limit in some browsers, which would silently truncate the export. The anchor is
   * appended before `click()` because a detached anchor is ignored by Firefox, and the object URL
   * is revoked afterwards so the blob is not retained.
   */
  download(filename: string, content: string): void {
    const blob = new Blob([content], {type: 'text/csv;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  /** Opens the browser's print dialog, which prints the `bs-printable` report (FR-030). */
  print(): void {
    window.print();
  }
}
