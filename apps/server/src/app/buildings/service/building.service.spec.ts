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
  const bookingModelMock = {countDocuments: jest.fn()};
  const userModelMock = {countDocuments: jest.fn()};

  beforeEach(async () => {
    jest.resetAllMocks();
    // Default: the facility resolves, and nothing references it, so a delete proceeds.
    // `jest.resetAllMocks()` clears the implementations, so both counts are set here.
    bookingModelMock.countDocuments.mockResolvedValue(0);
    userModelMock.countDocuments.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BuildingService,
        {provide: getModelToken('Building'), useValue: modelMock},
        {provide: getModelToken('Booking'), useValue: bookingModelMock},
        {provide: getModelToken('User'), useValue: userModelMock},
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

  it('deletes an unreferenced facility by id', async () => {
    modelMock.findOne.mockResolvedValue({_id: 'b1', property: 'hala-sportowa', city: 'siechnice'});
    modelMock.deleteOne.mockResolvedValue({deletedCount: 1});

    await expect(service.deleteBuilding('b1')).resolves.toEqual({deletedCount: 1});
    expect(bookingModelMock.countDocuments).toHaveBeenCalledWith({
      'place.place': 'hala-sportowa',
      'place.city': 'siechnice',
    });
    expect(userModelMock.countDocuments).toHaveBeenCalledWith({buildings: 'hala-sportowa'});
    expect(modelMock.deleteOne).toHaveBeenCalledWith({_id: 'b1'});
  });

  it('refuses to delete a facility a booking references, with 409', async () => {
    modelMock.findOne.mockResolvedValue({_id: 'b1', property: 'hala-sportowa', city: 'siechnice'});
    bookingModelMock.countDocuments.mockResolvedValue(1);

    await expect(service.deleteBuilding('b1')).rejects.toMatchObject({status: 409});
    expect(modelMock.deleteOne).not.toHaveBeenCalled();
  });

  it('refuses to delete a facility a staff user is assigned to, with 409', async () => {
    modelMock.findOne.mockResolvedValue({_id: 'b1', property: 'hala-sportowa', city: 'siechnice'});
    userModelMock.countDocuments.mockResolvedValue(1);

    await expect(service.deleteBuilding('b1')).rejects.toMatchObject({status: 409});
    expect(modelMock.deleteOne).not.toHaveBeenCalled();
  });

  it('deletes by id even when the facility does not resolve', async () => {
    // `findOne` returning null skips the reference checks; the delete still runs and
    // reports `deletedCount: 0`, matching the other delete routes' behaviour for a
    // missing id rather than inventing a 404 here.
    modelMock.findOne.mockResolvedValue(null);
    modelMock.deleteOne.mockResolvedValue({deletedCount: 0});

    await expect(service.deleteBuilding('b1')).resolves.toEqual({deletedCount: 0});
    expect(bookingModelMock.countDocuments).not.toHaveBeenCalled();
  });

  it('finds a single facility by id', async () => {
    modelMock.findOne.mockResolvedValue({_id: 'b1'});

    await expect(service.findBuilding('b1')).resolves.toEqual({_id: 'b1'});
    expect(modelMock.findOne).toHaveBeenCalledWith({_id: 'b1'});
  });

  it('lists every active facility, excluding retired ones', async () => {
    modelMock.find.mockResolvedValue([{_id: 'b1'}]);

    await expect(service.findAllBuildings()).resolves.toEqual([{_id: 'b1'}]);
    expect(modelMock.find).toHaveBeenCalledWith({active: {$ne: false}});
  });

  it('includes retired facilities when the caller asks for them (staff, T059)', async () => {
    modelMock.find.mockResolvedValue([{_id: 'b1'}]);

    await expect(service.findAllBuildings(true)).resolves.toEqual([{_id: 'b1'}]);
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
