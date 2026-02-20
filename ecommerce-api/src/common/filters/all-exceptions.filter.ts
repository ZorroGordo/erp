import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx     = host.switchToHttp();
    const reply   = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status  = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: unknown = 'Internal server error';

    if (exception instanceof HttpException) {
      status  = exception.getStatus();
      message = exception.getResponse();
    } else {
      this.logger.error('Unhandled exception', exception);
    }

    reply.status(status).send({
      statusCode: status,
      timestamp:  new Date().toISOString(),
      path:       request.url,
      error:      message,
    });
  }
}
