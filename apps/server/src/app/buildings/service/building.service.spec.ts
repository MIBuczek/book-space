import {Test, TestingModule} from '@nestjs/testing';
import {getModelToken} from '@nestjs/mongoose';
import {JwtService} from '@nestjs/jwt';
import {BuildingService} from './building.service';
import {BuildingDto, UpdateBuildingDto} from '../models/building.dto';

/**
 * The service is a thin wrapper that maps a driver error onto an HTTP exception, so these
 * tests assert the delegation and the mapping rather than re-testing Mongoose. The model is
 * stubbed for that reason; the mapping is what would silently turn a failed write into a
 * `200` if it were dropped.
 */
describe('BuildingService', () => {
  let service: BuildingService;

  const modelMock = {
    create: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn(),
    deleteOne: jest.fn(),
  };

  beforeEach(async () => {
    jest.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuildingService,
        {provide: getModelToken('Building'), useValue: modelMock},
        {provide: JwtService, useValue: {sign: jest.fn(), verify: jest.fn()}},
      ],
    }).compile();

    service = module.get<BuildingService>(BuildingService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('creates a facility through the model', async () => {
    const building = {property: 'hala-sportowa'} as BuildingDto;
    modelMock.create.mockResolvedValue(building);

    await expect(service.createBuilding(building)).resolves.toBe(building);
    expect(modelMock.create).toHaveBeenCalledWith(building);
  });

  it('updates a facility by id', async () => {
    const update = {lighting: true} as UpdateBuildingDto;
    modelMock.updateOne.mockResolvedValue({matchedCount: 1});

    await expect(service.updateBuilding('b1', update)).resolves.toEqual({matchedCount: 1});
    expect(modelMock.updateOne).toHaveBeenCalledWith({_id: 'b1'}, update);
  });

  it('deletes a facility by id', async () => {
    modelMock.deleteOne.mockResolvedValue({deletedCount: 1});

    await expect(service.deleteBuilding('b1')).resolves.toEqual({deletedCount: 1});
    expect(modelMock.deleteOne).toHaveBeenCalledWith({_id: 'b1'});
  });

  it('finds a single facility by id', async () => {
    modelMock.findOne.mockResolvedValue({_id: 'b1'});

    await expect(service.findBuilding('b1')).resolves.toEqual({_id: 'b1'});
    expect(modelMock.findOne).toHaveBeenCalledWith({_id: 'b1'});
  });

  it('lists every facility', async () => {
    modelMock.find.mockResolvedValue([{_id: 'b1'}]);

    await expect(service.findAllBuildings()).resolves.toEqual([{_id: 'b1'}]);
    expect(modelMock.find).toHaveBeenCalledWith({});
  });

  it('maps a driver error on read onto an HTTP exception rather than returning it', async () => {
    modelMock.find.mockRejectedValue(new Error('connection lost'));

    await expect(service.findAllBuildings()).rejects.toMatchObject({
      message: 'connection lost',
      status: 500,
    });
  });

  it('maps a driver error on write onto an HTTP exception', async () => {
    modelMock.create.mockRejectedValue(new Error('E11000 duplicate key'));

    await expect(service.createBuilding({} as BuildingDto)).rejects.toMatchObject({
      status: 500,
    });
  });

  it('maps a driver error on update, delete and read-one onto an HTTP exception', async () => {
    modelMock.updateOne.mockRejectedValue(new Error('connection lost'));
    modelMock.deleteOne.mockRejectedValue(new Error('connection lost'));
    modelMock.findOne.mockRejectedValue(new Error('connection lost'));

    await expect(service.updateBuilding('b1', {} as UpdateBuildingDto)).rejects.toMatchObject({
      status: 500,
    });
    await expect(service.deleteBuilding('b1')).rejects.toMatchObject({status: 500});
    await expect(service.findBuilding('b1')).rejects.toMatchObject({status: 500});
  });
});
