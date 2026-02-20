import { CatalogService } from './catalog.service';
export declare class CatalogController {
    private readonly catalog;
    constructor(catalog: CatalogService);
    list(search?: string, categoryId?: string, req?: any): Promise<import("./catalog.service").CatalogResponse>;
    categories(): Promise<import("../erp-adapter/erp-adapter.types").ErpCategory[]>;
    single(id: string, req?: any): Promise<import("./catalog.service").ProductListItem>;
}
