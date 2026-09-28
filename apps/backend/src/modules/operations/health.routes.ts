import { Router } from 'express';
import type { Logger } from 'pino';

export function healthRoutes(
  checkDatabase: () => Promise<void>,
  logger: Logger,
) {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json({ status: 'ok', service: 'whatsflow-backend' });
  });
  router.get('/ready', async (_req, res) => {
    try {
      await checkDatabase();
      res.json({ status: 'ok', checks: { database: 'up' } });
    } catch {
      logger.warn({ event: 'database_readiness_failed' }, 'Banco indisponível');
      res
        .status(503)
        .json({ status: 'unavailable', checks: { database: 'down' } });
    }
  });
  return router;
}
