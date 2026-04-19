import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { AppError } from '../utils/AppError';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Returns a middleware that validates req[target] against the given Zod schema.
 * Replaces the target with the parsed (coerced) output.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);
    if (!result.success) {
      const error = result.error as ZodError;
      const messages = error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
      return next(AppError.badRequest(`Validation error: ${messages}`, 'VALIDATION_ERROR'));
    }
    // Replace with coerced output (type transforms etc.)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;
    next();
  };
}
