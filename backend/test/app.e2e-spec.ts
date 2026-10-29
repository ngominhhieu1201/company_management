import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as cookieParser from 'cookie-parser';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('App (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('csrf + login + me', async () => {
    const csrf = await request(app.getHttpServer()).get('/api/auth/csrf');
    expect(csrf.status).toBe(200);
    expect(csrf.body.csrfToken).toBeDefined();

    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ username: 'admin', password: 'Admin@123' });
    expect(login.status).toBe(201);
    expect(login.body.user.username).toBe('admin');
    expect(login.body.user.passwordHash).toBeUndefined();

    const cookies = login.headers['set-cookie'];
    const me = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Cookie', cookies);
    expect(me.status).toBe(200);
    expect(me.body.user.role).toBe('ADMIN');
  });
});
