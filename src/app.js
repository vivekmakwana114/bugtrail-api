import express from 'express';
import helmet from 'helmet';
import mongoSanitize from 'express-mongo-sanitize';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import passport from 'passport';
import httpStatus from 'http-status';
import config from './config/config.js';
import morgan from './config/morgan.js';
import { jwtStrategy } from './config/passport.js';
import { authLimiter } from './middlewares/rateLimiter.js';
import routes from './routes/v1/index.js';
import { errorConverter, errorHandler } from './middlewares/error.js';
import ApiError from './utils/ApiError.js';

const app = express();

// In production we sit behind exactly one proxy (Nginx or Railway's edge). Trusting it gives
// rate limiting the real client IP and lets req.secure reflect the original HTTPS request.
// Not enabled locally: with no proxy, trusting X-Forwarded-For would let clients spoof their IP.
if (config.env === 'production') {
  app.set('trust proxy', 1);
}

if (config.env !== 'test') {
  app.use(morgan.successHandler);
  app.use(morgan.errorHandler);
}

// set security HTTP headers
app.use(helmet());

// parse json request body
app.use(express.json({ limit: '100kb' }));

// parse urlencoded request body
app.use(express.urlencoded({ extended: true }));

// parse cookies (the refresh token lives in an httpOnly cookie)
app.use(cookieParser());

// strip `$` and `.` keys from input so a body like { "email": { "$gt": "" } } can't become a Mongo operator.
// No xss-clean: it HTML-escapes stored text (breaking code pasted into bugs/chat). Output is escaped by the UI.
app.use(mongoSanitize());

// gzip compression
app.use(compression());

// cors: only the web app may call the API with credentials (cookies)
const corsOptions = { origin: config.clientUrl, credentials: true };
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// jwt authentication
app.use(passport.initialize());
passport.use('jwt', jwtStrategy);

// limit repeated failed requests to auth endpoints
if (config.env === 'production') {
  app.use('/v1/auth', authLimiter);
}

// v1 api routes
app.use('/v1', routes);

// send back a 404 error for any unknown api request
app.use((req, res, next) => {
  next(new ApiError(httpStatus.NOT_FOUND, 'Not found'));
});

// convert error to ApiError, if needed
app.use(errorConverter);

// handle error
app.use(errorHandler);

export default app;
