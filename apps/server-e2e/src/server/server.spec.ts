import axios from 'axios';

describe('GET /api', () => {
  it('reports the banner and the build version', async () => {
    const res = await axios.get(`/api`);

    expect(res.status).toBe(200);
    expect(res.data).toMatchObject({message: 'Hello API'});
    // The version is stamped at build time, so assert its shape rather than the
    // commit count, which changes with every merge.
    expect(res.data.version).toMatch(/^\d+\.\d+\.\d+\+\d+$/);
  });
});
