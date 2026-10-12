import request from 'supertest';
import httpStatus from 'http-status';
import app from '../../src/app.js';
import setupTestDB from '../utils/setupTestDB.js';

setupTestDB();

describe('GET /v1/health', () => {
  test('should return 200 with db up, without authentication', async () => {
    const res = await request(app).get('/v1/health').expect(httpStatus.OK);
    expect(res.body).toMatchObject({ status: 'ok', db: 'up' });
  });
});
