import http from 'http';
import mongoose from 'mongoose';
import app from './app.js';
import config from './config/config.js';
import logger from './config/logger.js';
import initSockets from './sockets/index.js';
import startEmailOutboxWorker from './jobs/emailOutbox.worker.js';

/*
 * One process runs everything: REST (Express), realtime (Socket.IO on the same port) and the email
 * outbox worker. Socket rooms live in this process's memory, so run ONE instance (PM2 instances: 1).
 */

let server;
let io;
let stopEmailWorker;

mongoose.connect(config.mongoose.url, config.mongoose.options).then(() => {
  logger.info('Connected to MongoDB');
  server = http.createServer(app);
  io = initSockets(server);
  server.listen(config.port, () => {
    logger.info(`Listening to port ${config.port}`);
  });
  stopEmailWorker = startEmailOutboxWorker();
});

const shutdown = (onClosed) => {
  if (stopEmailWorker) stopEmailWorker();
  if (io) {
    io.close(() => onClosed()); // disconnects sockets, then closes the HTTP server
  } else if (server) {
    server.close(onClosed);
  } else {
    onClosed();
  }
};

const exitHandler = () => {
  shutdown(() => {
    logger.info('Server closed');
    process.exit(1);
  });
};

const unexpectedErrorHandler = (error) => {
  logger.error(error);
  exitHandler();
};

process.on('uncaughtException', unexpectedErrorHandler);
process.on('unhandledRejection', unexpectedErrorHandler);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  shutdown(() => logger.info('Server closed'));
});
