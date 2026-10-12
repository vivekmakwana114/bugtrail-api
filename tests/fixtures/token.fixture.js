import moment from 'moment';
import config from '../../src/config/config.js';
import { tokenTypes } from '../../src/config/tokens.js';
import tokenService from '../../src/services/token.service.js';
import { userOne, userTwo, admin, qaUser, projectManager, pendingUser, suspendedUser } from './user.fixture.js';

const accessTokenExpires = moment().add(config.jwt.accessExpirationMinutes, 'minutes');
const accessTokenFor = (user) => tokenService.generateToken(user._id, accessTokenExpires, tokenTypes.ACCESS);

const userOneAccessToken = accessTokenFor(userOne);
const userTwoAccessToken = accessTokenFor(userTwo);
const adminAccessToken = accessTokenFor(admin);
const qaUserAccessToken = accessTokenFor(qaUser);
const projectManagerAccessToken = accessTokenFor(projectManager);
const pendingUserAccessToken = accessTokenFor(pendingUser);
const suspendedUserAccessToken = accessTokenFor(suspendedUser);

export {
  userOneAccessToken,
  userTwoAccessToken,
  adminAccessToken,
  qaUserAccessToken,
  projectManagerAccessToken,
  pendingUserAccessToken,
  suspendedUserAccessToken,
};
