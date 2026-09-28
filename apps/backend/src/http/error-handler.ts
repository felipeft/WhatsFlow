import type { ErrorRequestHandler } from 'express';

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
  const type =
    typeof error === 'object' && error !== null && 'type' in error
      ? error.type
      : null;
  const status =
    type === 'entity.parse.failed'
      ? 400
      : type === 'entity.too.large'
        ? 413
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
