import express from 'express';
import authRoute from './auth.route.js';
import healthRoute from './health.route.js';
import userRoute from './user.route.js';
import roleRoute from './role.route.js';
import projectRoute from './project.route.js';
import bugRoute from './bug.route.js';
import messageRoute from './message.route.js';
import notificationRoute from './notification.route.js';
import dashboardRoute from './dashboard.route.js';
import docsRoute from './docs.route.js';
import config from '../../config/config.js';

const router = express.Router();

const defaultRoutes = [
  {
    path: '/health',
    route: healthRoute,
  },
  {
    path: '/auth',
    route: authRoute,
  },
  {
    path: '/users',
    route: userRoute,
  },
  {
    path: '/roles',
    route: roleRoute,
  },
  {
    path: '/projects',
    route: projectRoute,
  },
  {
    path: '/bugs',
    route: bugRoute,
  },
  {
    path: '/messages',
    route: messageRoute,
  },
  {
    path: '/notifications',
    route: notificationRoute,
  },
  {
    path: '/dashboard',
    route: dashboardRoute,
  },
];

const devRoutes = [
  // routes available only in development mode
  {
    path: '/docs',
    route: docsRoute,
  },
];

defaultRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

/* istanbul ignore next */
if (config.env === 'development') {
  devRoutes.forEach((route) => {
    router.use(route.path, route.route);
  });
}

export default router;
