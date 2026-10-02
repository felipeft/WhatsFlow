import express from 'express';
import { z } from 'zod';
import { ApiError } from '@/http/api-error.js';
import type { ConversationService } from './conversation.service.js';

const idSchema = z.uuid();
const querySchema = z.object({
  cursor: z.string().min(1).max(512).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
});

export function conversationRoutes(service: ConversationService) {
  const router = express.Router();

  router.get('/', async (req, res) => {
    res.json(await service.list(parseQuery(req.query)));
  });

  router.get('/:id', async (req, res) => {
    res.json(await service.get(parseId(req.params.id)));
  });

  router.get('/:id/messages', async (req, res) => {
    res.json(
      await service.messages(parseId(req.params.id), parseQuery(req.query)),
    );
  });

  return router;
}

function parseId(value: string | undefined) {
  const result = idSchema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_REQUEST');
  return result.data;
}

function parseQuery(value: unknown) {
  const result = querySchema.safeParse(value);
  if (!result.success) throw new ApiError(400, 'INVALID_REQUEST');
  return result.data;
}
