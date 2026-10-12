import moment from 'moment';
import config from '../../src/config/config.js';
import { tokenTypes } from '../../src/config/tokens.js';
import tokenService from '../../src/services/token.service.js';
import { userOne, admin, projectManager, pendingUser, suspendedUser } from './user.fixture.js';

const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, 'minutes');
const accessTokenFor = (user) => tokenService.generateToken(user._id, accessTokenExpires, tokenTypes.ACCESS);

const userOneAccessToken = accessTokenFor(userOne);
const adminAccessToken = accessTokenFor(admin);
const projectManagerAccessToken = accessTokenFor(projectManager);
const pendingUserAccessToken = accessTokenFor(pendingUser);
const suspendedUserAccessToken = accessTokenFor(suspendedUser);

export { userOneAccessToken, adminAccessToken, projectManagerAccessToken, pendingUserAccessToken, suspendedUserAccessToken };
