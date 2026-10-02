import { randomUUID } from 'node:crypto';
import express from 'express';
import { pinoHttp } from 'pino-http';
import type { Logger } from 'pino';
import { errorHandler } from '@/http/error-handler.js';
import { healthRoutes } from '@/modules/operations/health.routes.js';
import { metaWebhookController } from '@/integrations/meta/webhook.controller.js';
import type { WebhookService } from '@/integrations/meta/webhook.service.js';
import { conversationRoutes } from '@/modules/conversations/conversation.routes.js';
import type { ConversationService } from '@/modules/conversations/conversation.service.js';

interface AppDependencies {
  logger: Logger;
  checkDatabase: () => Promise<void>;
  metaWebhook?: WebhookService;
  conversations?: ConversationService;
}

export function createApp({
  logger,
  checkDatabase,
  metaWebhook,
  conversations,
}: AppDependencies) {
  const app = express();
  app.disable('x-powered-by');
  app.use(
    pinoHttp({
      logger,
      genReqId: (_req, res) => {
        const id = randomUUID();
        res.setHeader('X-Request-Id', id);
        return id;
      },
      // Não coletar corpo, headers, query strings ou erros brutos em logs HTTP.
      serializers: {
        req: (req) => ({ id: req.id, method: req.method }),
        res: (res) => ({ statusCode: res.statusCode }),
        err: () => ({ type: 'HttpError' }),
      },
    }),
  );
  // A assinatura deve usar os bytes originais, antes do parser JSON global.
  if (metaWebhook)
    app.use('/webhooks/meta', metaWebhookController(metaWebhook));
  app.use(express.json({ limit: '16kb' }));
  app.use('/health', healthRoutes(checkDatabase, logger));
  if (conversations)
    app.use('/api/conversations', conversationRoutes(conversations));
  app.use((req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', requestId: req.id } });
  });
  app.use(errorHandler);
  return app;
}
