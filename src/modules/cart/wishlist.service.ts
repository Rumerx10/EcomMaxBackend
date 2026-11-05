import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { fixed2 } from '../../common/utils/money.js';
import {
  TenantPrismaService,
  type TenantTransactionClient,
} from '../../tenant/tenant-prisma.service.js';
import type { WishlistResponseDto } from './dto/cart.dto.js';
import { newGuestToken, type Shopper } from './shopper.js';

export const MAX_WISHLIST_ITEMS = 200;

// Saved products, for signed-in users and for guests (same guest token as the cart).
@Injectable()
export class WishlistService {
  constructor(private readonly tenantPrisma: TenantPrismaService) {}

  private get db() {
    return this.tenantPrisma.db;
  }

  async get(shopper: Shopper): Promise<WishlistResponseDto> {
    const wishlist = await this.find(shopper);
    if (!wishlist) {
      return {
        guestToken: shopper.kind === 'guest' ? shopper.guestToken : null,
        items: [],
      };
    }
    return this.view(wishlist);
  }

  // Adding a product that is already saved changes nothing.
  async add(shopper: Shopper, productId: string): Promise<WishlistResponseDto> {
    const product = await this.db.product.findFirst({
      where: { id: productId, status: 'ACTIVE' },
      select: { id: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const wishlist = await this.findOrCreate(shopper);
    const sellerId = this.tenantPrisma.sellerId;
    const key = { sellerId, wishlistId: wishlist.id, productId };
    const saved = await this.db.wishlistItem.findUnique({
      where: { sellerId_wishlistId_productId: key },
    });
    if (!saved) {
      if (
        (await this.db.wishlistItem.count({
          where: { wishlistId: wishlist.id },
        })) >= MAX_WISHLIST_ITEMS
      ) {
        throw new ConflictException(
          `A wishlist can hold at most ${MAX_WISHLIST_ITEMS} products`,
        );
      }
      await this.db.wishlistItem.create({ data: key });
    }
    return this.view(wishlist);
  }

  async remove(
    shopper: Shopper,
    productId: string,
  ): Promise<WishlistResponseDto> {
    const wishlist = await this.find(shopper);
    if (!wishlist) return this.get(shopper);
    await this.db.wishlistItem.deleteMany({
      where: { wishlistId: wishlist.id, productId },
    });
    return this.view(wishlist);
  }

  // After sign-in: the guest's saved products move to the user's wishlist.
  async mergeGuestWishlist(
    userId: string,
    guestToken: string,
    tx: TenantTransactionClient = this.db,
  ): Promise<void> {
    const sellerId = this.tenantPrisma.sellerId;
    const guest = await tx.wishlist.findUnique({
      where: { sellerId_guestToken: { sellerId, guestToken } },
      include: { items: true },
    });
    if (!guest) return;
    const mine = await tx.wishlist.upsert({
      where: { sellerId_userId: { sellerId, userId } },
      create: { sellerId, userId },
      update: {},
    });
    await tx.wishlistItem.createMany({
      data: guest.items.map(({ productId }) => ({
        sellerId,
        wishlistId: mine.id,
        productId,
      })),
      skipDuplicates: true,
    });
    await tx.wishlist.delete({ where: { id: guest.id } });
  }

  private find(shopper: Shopper) {
    const sellerId = this.tenantPrisma.sellerId;
    const select = { id: true, guestToken: true };
    if (shopper.kind === 'user') {
      return this.db.wishlist.findUnique({
        where: { sellerId_userId: { sellerId, userId: shopper.userId } },
        select,
      });
    }
    if (!shopper.guestToken) return Promise.resolve(null);
    return this.db.wishlist.findUnique({
      where: {
        sellerId_guestToken: { sellerId, guestToken: shopper.guestToken },
      },
      select,
    });
  }

  private findOrCreate(shopper: Shopper) {
    const sellerId = this.tenantPrisma.sellerId;
    const select = { id: true, guestToken: true };
    if (shopper.kind === 'user') {
      return this.db.wishlist.upsert({
        where: { sellerId_userId: { sellerId, userId: shopper.userId } },
        create: { sellerId, userId: shopper.userId },
        update: {},
        select,
      });
    }
    const guestToken = shopper.guestToken ?? newGuestToken();
    return this.db.wishlist.upsert({
      where: { sellerId_guestToken: { sellerId, guestToken } },
      create: { sellerId, guestToken },
      update: {},
      select,
    });
  }

  private async view(wishlist: {
    id: string;
    guestToken: string | null;
  }): Promise<WishlistResponseDto> {
    const items = await this.db.wishlistItem.findMany({
      where: { wishlistId: wishlist.id },
      include: {
        product: {
          include: { images: { orderBy: { position: 'asc' }, take: 1 } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    return {
      guestToken: wishlist.guestToken,
      items: items.map(({ product, createdAt }) => ({
        productId: product.id,
        title: product.title,
        slug: product.slug,
        price: fixed2(product.price),
        thumbnail: product.images[0]?.url ?? null,
        available: product.status === 'ACTIVE' && product.stock > 0,
        addedAt: createdAt,
      })),
    };
  }
}
