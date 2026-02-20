import { PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
export declare class ZodPipe<T> implements PipeTransform {
    private readonly schema;
    constructor(schema: ZodSchema<T>);
    transform(value: unknown): T;
}
