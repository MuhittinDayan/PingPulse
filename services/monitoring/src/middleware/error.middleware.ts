import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError, ErrorCode } from '../errors/app-error';

const bodyParserErrors: Record<string, { code: ErrorCode; message: string }> = {
  'entity.parse.failed': { code: 'INVALID_JSON', message: 'Malformed JSON body' },
  'entity.too.large': { code: 'PAYLOAD_TOO_LARGE', message: 'Request body is too large' },
  'charset.unsupported': { code: 'UNSUPPORTED_ENCODING', message: 'Unsupported charset' },
  'encoding.unsupported': { code: 'UNSUPPORTED_ENCODING', message: 'Unsupported content encoding' },
};

export const notFoundHandler: RequestHandler = (req) => {
  throw new AppError(404, 'ROUTE_NOT_FOUND', `Route ${req.method} ${req.path} not found`);
};

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof AppError) {
    res.status(error.status).json({
      statusCode: error.status,
      code: error.code,
      message: error.message,
      ...(error.details ? { errors: error.details } : {}),
    });
    return;
  }

  if (error?.status >= 400 && error.status < 500) {
    const known = bodyParserErrors[error.type] ?? { code: 'BAD_REQUEST', message: 'Bad request' };
    res.status(error.status).json({ statusCode: error.status, ...known });
    return;
  }

  console.error(error);
  res.status(500).json({ statusCode: 500, code: 'INTERNAL_ERROR', message: 'Internal server error' });
};
