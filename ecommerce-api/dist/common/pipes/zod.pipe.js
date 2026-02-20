"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ZodPipe = void 0;
const common_1 = require("@nestjs/common");
let ZodPipe = class ZodPipe {
    schema;
    constructor(schema) {
        this.schema = schema;
    }
    transform(value) {
        const result = this.schema.safeParse(value);
        if (!result.success) {
            const issues = result.error.issues ?? result.error.errors ?? [];
            const errors = issues.map((e) => ({
                field: Array.isArray(e.path) ? e.path.join('.') : String(e.path),
                message: e.message,
            }));
            throw new common_1.BadRequestException({ message: 'Validation failed', errors });
        }
        return result.data;
    }
};
exports.ZodPipe = ZodPipe;
exports.ZodPipe = ZodPipe = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [Function])
], ZodPipe);
//# sourceMappingURL=zod.pipe.js.map