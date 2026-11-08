import { Injectable } from '@nestjs/common';
import { APP_VERSION } from '@booking/version';

@Injectable()
export class AppService {
  /**
   * The health banner.
   *
   * It carries the application version so an operator can tell which build is
   * deployed from one request, without reading the container image tag. The value
   * is stamped at build time (`1.0.0+<commit count>`) and shared with the UI
   * footer through `@booking/version`, so the two cannot disagree.
   */
  getData(): { message: string; version: string } {
    return { message: 'Hello API', version: APP_VERSION };
  }
}
