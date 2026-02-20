import { Controller, Get, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { CatalogService } from './catalog.service';
import { CurrentUser, type CurrentUserPayload } from '../../common/decorators/current-user.decorator';

@Controller('catalog')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  /**
   * GET /api/catalog
   * Returns product list with personalised pricing.
   * Auth is optional — guests get base B2C prices.
   */
  @Get()
  async list(
    @Query('search')     search?: string,
    @Query('categoryId') categoryId?: string,
    @Req() req?: any,
  ) {
    // Soft auth: extract user from JWT if present, but don't reject unauthenticated
    const user: CurrentUserPayload | undefined = req?.user;
    return this.catalog.getCatalog({
      userId:     user?.id,
      userType:   user?.type ?? 'GUEST',
      search,
      categoryId,
    });
  }

  /**
   * GET /api/catalog/categories
   */
  @Get('categories')
  async categories() {
    return this.catalog.getCategories();
  }

  /**
   * GET /api/catalog/:id
   */
  @Get(':id')
  async single(@Param('id') id: string, @Req() req?: any) {
    const user: CurrentUserPayload | undefined = req?.user;
    return this.catalog.getProduct(id, {
      userId:   user?.id,
      userType: user?.type ?? 'GUEST',
    });
  }
}
