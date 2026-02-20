import { PipeTransform, Injectable, BadRequestException } from '@nestjs/common';
import type { ZodSchema } from 'zod';

@Injectable()
export class ZodPipe<T> implements PipeTransform {
  constructor(private readonly schema: ZodSchema<T>) {}

  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      // Zod v4 uses .issues; v3 had .errors as alias — handle both
      const issues: any[] = (result.error as any).issues ?? (result.error as any).errors ?? [];
      const errors = issues.map((e: any) => ({
        field:   Array.isArray(e.path) ? e.path.join('.') : String(e.path),
        message: e.message,
      }));
      throw new BadRequestException({ message: 'Validation failed', errors });
    }
    return result.data;
  }
}
