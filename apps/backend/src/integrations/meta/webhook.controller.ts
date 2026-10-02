import express from 'express';
import type { WebhookService } from './webhook.service.js';
import { WebhookError } from './webhook.service.js';

export function metaWebhookController(service: WebhookService) {
  const router = express.Router();
  router.get('/', (req, res) => {
    res.type('text/plain').send(service.verify(req.query));
    req.log.info({ event: 'meta_webhook_verified' }, 'Webhook verificado');
  });
  router.post(
    '/',
    express.raw({ type: 'application/json', limit: '1mb', inflate: false }),
    async (req, res) => {
      if (!Buffer.isBuffer(req.body))
        throw new WebhookError(415, 'JSON_REQUIRED');
      const result = await service.receive(
        req.body,
        req.get('x-hub-signature-256'),
      );
      req.log.info(
        { event: 'meta_webhook_received', ...result },
        'Webhook persistido',
      );
      res.status(200).json({ received: true });
    },
  );
  return router;
}
