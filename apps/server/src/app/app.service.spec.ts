import { Test } from '@nestjs/testing';

import { APP_VERSION } from '@booking/version';
import { AppService } from './app.service';

describe('AppService', () => {
  let service: AppService;

  beforeAll(async () => {
    const app = await Test.createTestingModule({
      providers: [AppService]
    }).compile();

    service = app.get<AppService>(AppService);
  });

  describe('getData', () => {
    it('reports the banner and the build version', () => {
      expect(service.getData()).toEqual({ message: 'Hello API', version: APP_VERSION });
    });

    it('reports a semantic version, so an operator can identify the build', () => {
      expect(service.getData().version).toMatch(/^\d+\.\d+\.\d+\+\d+$/);
    });
  });
});
