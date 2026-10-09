import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import Joi from 'joi';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

dotenv.config({ path: path.join(__dirname, '../../.env') });

const envVarsSchema = Joi.object()
  .keys({
    NODE_ENV: Joi.string().valid('production', 'development', 'test').required(),
    PORT: Joi.number().default(5000),
    MONGODB_URL: Joi.string().required().description('Mongo DB url'),
    JWT_SECRET: Joi.string().required().description('JWT secret key'),
    JWT_ACCESS_EXPIRATION_MINUTES: Joi.number().default(30).description('minutes after which access tokens expire'),
    JWT_REFRESH_EXPIRATION_DAYS: Joi.number().default(30).description('days after which refresh tokens expire'),
    SMTP_HOST: Joi.string().description('server that will send the emails'),
    SMTP_PORT: Joi.number().description('port to connect to the email server'),
    SMTP_USERNAME: Joi.string().description('username for email server'),
    SMTP_PASSWORD: Joi.string().description('password for email server'),
    EMAIL_FROM: Joi.string().description('the from field in the emails sent by the app'),
    EMAIL_ENABLED: Joi.boolean().default(false).description('when false, emails are logged instead of sent'),
    CLIENT_URL: Joi.string().uri().default('http://localhost:3000').description('web app origin (CORS + email links)'),
    COOKIE_SECURE: Joi.boolean().default(false).description('send auth cookies over HTTPS only'),
    COOKIE_SAME_SITE: Joi.string().valid('lax', 'strict', 'none').default('lax').description('SameSite for auth cookies'),
    SEED_ADMIN_NAME: Joi.string().description('name of the first Admin created by npm run seed'),
    SEED_ADMIN_EMAIL: Joi.string().email().description('email of the first Admin created by npm run seed'),
    SEED_ADMIN_PASSWORD: Joi.string().min(8).description('password of the first Admin created by npm run seed'),
  })
  // Browsers reject SameSite=None cookies that aren't also Secure, so fail at boot instead of at login.
  .custom((env, helpers) => {
    if (env.COOKIE_SAME_SITE === 'none' && !env.COOKIE_SECURE) {
      return helpers.message('COOKIE_SAME_SITE=none requires COOKIE_SECURE=true');
    }
    return env;
  })
  .unknown();

const { value: envVars, error } = envVarsSchema.prefs({ errors: { label: 'key' } }).validate(process.env);

if (error) {
  throw new Error(`Config validation error: ${error.message}`);
}

export default {
  env: envVars.NODE_ENV,
  port: envVars.PORT,
  mongoose: {
    url: envVars.MONGODB_URL + (envVars.NODE_ENV === 'test' ? '-test' : ''),
    options: {},
  },
  jwt: {
    secret: envVars.JWT_SECRET,
    accessExpirationMinutes: envVars.JWT_ACCESS_EXPIRATION_MINUTES,
    refreshExpirationDays: envVars.JWT_REFRESH_EXPIRATION_DAYS,
    resetPasswordExpirationMinutes: 10,
  },
  email: {
    smtp: {
      host: envVars.SMTP_HOST,
      port: envVars.SMTP_PORT,
      auth: {
        user: envVars.SMTP_USERNAME,
        pass: envVars.SMTP_PASSWORD,
      },
    },
    from: envVars.EMAIL_FROM,
    enabled: envVars.EMAIL_ENABLED,
  },
  clientUrl: envVars.CLIENT_URL,
  cookie: {
    secure: envVars.COOKIE_SECURE,
    sameSite: envVars.COOKIE_SAME_SITE,
  },
  seedAdmin: {
    name: envVars.SEED_ADMIN_NAME,
    email: envVars.SEED_ADMIN_EMAIL,
    password: envVars.SEED_ADMIN_PASSWORD,
  },
};
