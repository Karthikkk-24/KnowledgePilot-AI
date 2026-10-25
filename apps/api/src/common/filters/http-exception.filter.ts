import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiErrorCode } from '@knowledgepilot/shared';
import { createRequestId, fail } from '../http';

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = createRequestId();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : typeof payload === 'object' && payload && 'message' in payload
            ? Array.isArray((payload as { message: unknown }).message)
              ? ((payload as { message: string[] }).message.join(', '))
              : String((payload as { message: unknown }).message)
            : exception.message;

      const code =
        status === HttpStatus.NOT_FOUND
          ? ApiErrorCode.NOT_FOUND
          : status === HttpStatus.BAD_REQUEST
            ? ApiErrorCode.BAD_REQUEST
            : status === HttpStatus.UNAUTHORIZED
              ? ApiErrorCode.UNAUTHORIZED
              : status === HttpStatus.FORBIDDEN
                ? ApiErrorCode.FORBIDDEN
                : status === HttpStatus.CONFLICT
                  ? ApiErrorCode.CONFLICT
                  : ApiErrorCode.INTERNAL;

      if (status >= 500) {
        this.logger.error(`request failed`, {
          requestId,
          status,
          err: exception instanceof Error ? exception.stack : String(exception),
        });
      }

      response.status(status).json(fail(code, message, {}, requestId));
      return;
    }

    this.logger.error(`unhandled error`, {
      requestId,
      err: exception instanceof Error ? exception.stack : String(exception),
    });
    response
      .status(HttpStatus.INTERNAL_SERVER_ERROR)
      .json(fail(ApiErrorCode.INTERNAL, 'An unexpected error occurred.', {}, requestId));
  }
}
