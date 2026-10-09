import express from 'express';
import mongoose from 'mongoose';
import httpStatus from 'http-status';

const router = express.Router();

/**
 * Liveness + DB check for Railway healthchecks and uptime monitors.
 * 503 when MongoDB isn't connected, so the platform stops routing traffic here.
 */
router.get('/', (req, res) => {
  const dbUp = mongoose.connection.readyState === 1;
  res.status(dbUp ? httpStatus.OK : httpStatus.SERVICE_UNAVAILABLE).send({
    status: dbUp ? 'ok' : 'degraded',
    db: dbUp ? 'up' : 'down',
    uptime: Math.round(process.uptime()),
  });
});

export default router;

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Health check (API process + MongoDB connection)
 *     tags: [Health]
 *     responses:
 *       "200":
 *         description: OK
 *       "503":
 *         description: MongoDB is not connected
 */
