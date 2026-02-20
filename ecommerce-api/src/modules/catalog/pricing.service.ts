/**
 * Pricing pipeline (all values in PEN, Decimal-safe via string arithmetic):
 *
 *  1. Start with ERP basePricePen (pre-IGV)
 *  2. Apply B2B agreement: FIXED_PRICE replaces base; DISCOUNT_PCT reduces it
 *  3. Stack subscription 20% on top: combined = 1 - (1 - b2bDisc) * (1 - 0.20)
 *  4. Apply IGV 18% to get final consumer price
 */

import { Injectable } from '@nestjs/common';
import Decimal from 'decimal.js';
import type { ErpPriceAgreement } from '../erp-adapter/erp-adapter.types';

const IGV_RATE      = new Decimal('0.18');
const SUB_DISC_RATE = new Decimal('0.20');
const D_ZERO        = new Decimal(0);
const D_ONE         = new Decimal(1);

export interface PricedItem {
  erpProductId:   string;
  sku:            string;
  name:           string;
  basePricePen:   string;   // original ERP price, pre-IGV, pre-discount
  unitPrice:      string;   // post-discount, pre-IGV — what we store in cart/order
  igvAmount:      string;   // IGV on unitPrice
  totalUnitPrice: string;   // unitPrice + igvAmount (shown to consumer)
  discountPct:    string;   // combined discount applied, 0–1
  igvRate:        string;   // always "0.18" for now
}

@Injectable()
export class PricingService {
  /**
   * Compute the price for a product for a specific buyer context.
   *
   * @param basePricePen  ERP basePricePen string (pre-IGV)
   * @param agreements    Active B2B agreements for this customer (can be empty)
   * @param productId     ERP product ID to look up the matching agreement
   * @param hasSubscription  Whether the customer has an active subscription
   */
  computeUnitPrice(
    basePricePen:  string,
    agreements:    ErpPriceAgreement[],
    productId:     string,
    hasSubscription = false,
  ): { unitPrice: Decimal; igvAmount: Decimal; totalUnitPrice: Decimal; discountPct: Decimal } {
    const base     = new Decimal(basePricePen);
    let postAgreement = base;
    let b2bDiscPct    = D_ZERO;

    // ── Step 1: B2B agreement ───────────────────────────────────────────────
    const agreement = agreements.find((a) => a.productId === productId);
    if (agreement) {
      if (agreement.pricingType === 'FIXED_PRICE') {
        postAgreement = new Decimal(agreement.value);
        // compute implied discount for display
        b2bDiscPct = base.gt(0)
          ? Decimal.max(0, base.minus(postAgreement).div(base))
          : D_ZERO;
      } else {
        // DISCOUNT_PCT: value is a fraction 0–1 (e.g. 0.10 = 10% off)
        b2bDiscPct    = new Decimal(agreement.value);
        postAgreement = base.times(D_ONE.minus(b2bDiscPct));
      }
    }

    // ── Step 2: Subscription stacking ──────────────────────────────────────
    // combined = 1 - (1 - b2bDiscPct) * (1 - 0.20)
    let discountPct = b2bDiscPct;
    let postSub     = postAgreement;
    if (hasSubscription) {
      discountPct = D_ONE.minus(
        D_ONE.minus(b2bDiscPct).times(D_ONE.minus(SUB_DISC_RATE)),
      );
      postSub = base.times(D_ONE.minus(discountPct));
    }

    // ── Step 3: IGV ─────────────────────────────────────────────────────────
    const unitPrice      = postSub.toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const igvAmount      = unitPrice.times(IGV_RATE).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);
    const totalUnitPrice = unitPrice.plus(igvAmount).toDecimalPlaces(4, Decimal.ROUND_HALF_UP);

    return { unitPrice, igvAmount, totalUnitPrice, discountPct };
  }

  /** Price a list of products in one call */
  priceProducts(
    products: Array<{ id: string; sku: string; name: string; basePricePen: string }>,
    agreements: ErpPriceAgreement[],
    hasSubscription = false,
  ): PricedItem[] {
    return products.map((p) => {
      const { unitPrice, igvAmount, totalUnitPrice, discountPct } = this.computeUnitPrice(
        p.basePricePen,
        agreements,
        p.id,
        hasSubscription,
      );
      return {
        erpProductId:   p.id,
        sku:            p.sku,
        name:           p.name,
        basePricePen:   p.basePricePen,
        unitPrice:      unitPrice.toFixed(4),
        igvAmount:      igvAmount.toFixed(4),
        totalUnitPrice: totalUnitPrice.toFixed(4),
        discountPct:    discountPct.toFixed(4),
        igvRate:        IGV_RATE.toFixed(4),
      };
    });
  }
}
