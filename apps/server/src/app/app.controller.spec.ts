import { Test, TestingModule } from '@nestjs/testing';

import { APP_VERSION } from '@booking/version';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let app: TestingModule;

  beforeAll(async () => {
    app = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService]
    }).compile();
  });

  describe('getData', () => {
    it('returns the banner and the version', () => {
      const appController = app.get<AppController>(AppController);
      expect(appController.getData()).toEqual({ message: 'Hello API', version: APP_VERSION });
    });
  });
});
