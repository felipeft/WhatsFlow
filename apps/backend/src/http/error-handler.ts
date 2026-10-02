import type { ErrorRequestHandler } from 'express';
import { ApiError } from '@/http/api-error.js';
import { WebhookError } from '@/integrations/meta/webhook.service.js';

export const errorHandler: ErrorRequestHandler = (
  error: unknown,
  req,
  res,
  next,
) => {
  if (res.headersSent) {
    next(error);
    return;
  }
  if (error instanceof WebhookError) {
    req.log.warn(
      {
        event:
          error.status === 401 || error.status === 403
            ? 'meta_auth_failed'
            : 'meta_webhook_invalid',
        code: error.code,
      },
      'Webhook rejeitado',
    );
    res
      .status(error.status)
      .json({ error: { code: error.code, requestId: req.id } });
    return;
  }
  if (error instanceof ApiError) {
    req.log.info(
      { event: 'api_request_rejected', code: error.code },
      'Requisição rejeitada',
    );
    res
      .status(error.status)
      .json({ error: { code: error.code, requestId: req.id } });
    return;
  }
  const type =
    typeof error === 'object' && error !== null && 'type' in error
      ? error.type
      : null;
  const status =
    type === 'entity.parse.failed'
      ? 400
      : type === 'entity.too.large'
        ? 413
        : type === 'encoding.unsupported' || type === 'charset.unsupported'
          ? 415
          : 500;
  // Não registrar error.message/stack aqui: drivers podem incluir dados sensíveis.
  req.log.error({ event: 'http_error', status }, 'Falha na requisição');
  res.status(status).json({
    error: {
      code: status === 500 ? 'INTERNAL_ERROR' : 'INVALID_REQUEST',
      requestId: req.id,
    },
  });
};
