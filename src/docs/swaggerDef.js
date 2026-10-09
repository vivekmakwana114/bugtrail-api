import { readFileSync } from 'fs';
import config from '../config/config.js';

// Static path resolved relative to this module, not user input
// eslint-disable-next-line security/detect-non-literal-fs-filename
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url)));

const swaggerDef = {
  openapi: '3.0.0',
  info: {
    title: 'BugTrail API documentation',
    version,
  },
  servers: [
    {
      url: `http://localhost:${config.port}/v1`,
    },
  ],
};

export default swaggerDef;
