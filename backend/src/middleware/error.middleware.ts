import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/AppError';
import { logger } from '../utils/logger';
import { env } from '../config/env';

interface ErrorResponse {
  success: false;
  error: {
    message: string;
    code?: string;
    statusCode: number;
    stack?: string;
  };
}

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = 500;
  let message = 'Internal Server Error';
  let code: string | undefined;
  let isOperational = false;

  if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    isOperational = err.isOperational;
  }

  // Log the error with context
  if (statusCode >= 500) {
    logger.error({ err, method: req.method, url: req.url, userId: req.user?.id },
      'Unhandled server error');
  } else {
    logger.warn({ message, code, method: req.method, url: req.url },
      'Client error');
  }

  const response: ErrorResponse = {
    success: false,
    error: {
      message: isOperational ? message : 'Something went wrong. Please try again.',
      code,
      statusCode,
      ...(env.NODE_ENV === 'development' && !isOperational ? { stack: err.stack } : {}),
    },
  };

  res.status(statusCode).json(response);
}

/** 404 handler — must be registered AFTER all routes */
export function notFoundHandler(req: Request, _res: Response, next: NextFunction): void {
  next(AppError.notFound(`Route ${req.method} ${req.url} not found`, 'ROUTE_NOT_FOUND'));
}
