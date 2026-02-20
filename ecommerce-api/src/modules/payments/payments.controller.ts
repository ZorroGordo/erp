import {
  Controller, Post, Body, Req, Headers,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { ZodPipe } from '../../common/pipes/zod.pipe';
import { ChargeSchema, WebhookSchema, type ChargeDto } from './payments.dto';
import type { CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  /**
   * POST /api/payments/charge
   * Frontend sends the Culqi token (chr_xxx) obtained from Culqi.js.
   * Auth is optional — guest checkout is allowed.
   */
  @Post('charge')
  async charge(@Req() req: any, @Body(new ZodPipe(ChargeSchema)) dto: ChargeDto) {
    const user: CurrentUserPayload | undefined = req.user;
    return this.payments.chargeOrder(dto, user?.id);
  }

  /**
   * POST /api/payments/webhook
   * Culqi calls this endpoint to notify async payment events.
   * The rawBody fallback works for verification; for production, configure
   * Fastify's addContentTypeParser to preserve raw bytes.
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async webhook(
    @Req() req: any,
    @Headers('x-culqi-signature') signature: string,
    @Body(new ZodPipe(WebhookSchema)) dto: any,
  ) {
    // Use raw body if available (Fastify stores it on rawBody when configured),
    // otherwise fall back to re-serialising the parsed body
    const rawBody: Buffer = req.rawBody ?? Buffer.from(JSON.stringify(dto));
    return this.payments.handleWebhook(rawBody, signature ?? '', dto);
  }
}
