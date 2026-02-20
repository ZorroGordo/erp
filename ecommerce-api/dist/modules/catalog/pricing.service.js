"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PricingService = void 0;
const common_1 = require("@nestjs/common");
const decimal_js_1 = __importDefault(require("decimal.js"));
const IGV_RATE = new decimal_js_1.default('0.18');
const SUB_DISC_RATE = new decimal_js_1.default('0.20');
const D_ZERO = new decimal_js_1.default(0);
const D_ONE = new decimal_js_1.default(1);
let PricingService = class PricingService {
    computeUnitPrice(basePricePen, agreements, productId, hasSubscription = false) {
        const base = new decimal_js_1.default(basePricePen);
        let postAgreement = base;
        let b2bDiscPct = D_ZERO;
        const agreement = agreements.find((a) => a.productId === productId);
        if (agreement) {
            if (agreement.pricingType === 'FIXED_PRICE') {
                postAgreement = new decimal_js_1.default(agreement.value);
                b2bDiscPct = base.gt(0)
                    ? decimal_js_1.default.max(0, base.minus(postAgreement).div(base))
                    : D_ZERO;
            }
            else {
                b2bDiscPct = new decimal_js_1.default(agreement.value);
                postAgreement = base.times(D_ONE.minus(b2bDiscPct));
            }
        }
        let discountPct = b2bDiscPct;
        let postSub = postAgreement;
        if (hasSubscription) {
            discountPct = D_ONE.minus(D_ONE.minus(b2bDiscPct).times(D_ONE.minus(SUB_DISC_RATE)));
            postSub = base.times(D_ONE.minus(discountPct));
        }
        const unitPrice = postSub.toDecimalPlaces(4, decimal_js_1.default.ROUND_HALF_UP);
        const igvAmount = unitPrice.times(IGV_RATE).toDecimalPlaces(4, decimal_js_1.default.ROUND_HALF_UP);
        const totalUnitPrice = unitPrice.plus(igvAmount).toDecimalPlaces(4, decimal_js_1.default.ROUND_HALF_UP);
        return { unitPrice, igvAmount, totalUnitPrice, discountPct };
    }
    priceProducts(products, agreements, hasSubscription = false) {
        return products.map((p) => {
            const { unitPrice, igvAmount, totalUnitPrice, discountPct } = this.computeUnitPrice(p.basePricePen, agreements, p.id, hasSubscription);
            return {
                erpProductId: p.id,
                sku: p.sku,
                name: p.name,
                basePricePen: p.basePricePen,
                unitPrice: unitPrice.toFixed(4),
                igvAmount: igvAmount.toFixed(4),
                totalUnitPrice: totalUnitPrice.toFixed(4),
                discountPct: discountPct.toFixed(4),
                igvRate: IGV_RATE.toFixed(4),
            };
        });
    }
};
exports.PricingService = PricingService;
exports.PricingService = PricingService = __decorate([
    (0, common_1.Injectable)()
], PricingService);
//# sourceMappingURL=pricing.service.js.map