import passportJwt from 'passport-jwt';
import config from './config.js';
import { tokenTypes } from './tokens.js';
import { userStatuses } from './userStatuses.js';
import { User } from '../models/index.js';

const { Strategy: JwtStrategy, ExtractJwt } = passportJwt;

const jwtOptions = {
  secretOrKey: config.jwt.secret,
  jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
};

/**
 * The token only proves *who* the caller is. Role and status are re-read from the DB on
 * every request, so a suspension or a role edit takes effect immediately, not when the
 * access token happens to expire.
 */
const jwtVerify = async (payload, done) => {
  try {
    if (payload.type !== tokenTypes.ACCESS) {
      throw new Error('Invalid token type');
    }
    const user = await User.findById(payload.sub).populate('role');
    if (!user || user.status !== userStatuses.ACTIVE) {
      return done(null, false);
    }
    done(null, user);
  } catch (error) {
    done(error, false);
  }
};

const jwtStrategy = new JwtStrategy(jwtOptions, jwtVerify);

export { jwtStrategy };
