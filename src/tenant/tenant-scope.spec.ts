import { readFileSync } from 'node:fs';
import { CrossTenantError, scopeArgs, TENANT_MODELS } from './tenant-scope.js';

const A = '0192f3c4-0000-7000-8000-00000000000a';
const B = '0192f3c4-0000-7000-8000-00000000000b';

describe('TENANT_MODELS', () => {
  it('is exactly the models in schema.prisma that have a sellerId field', () => {
    const schema = readFileSync(
      new URL('../../prisma/schema.prisma', import.meta.url),
      'utf8',
    );
    const models = [...schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)];
    const withSellerId = models
      .filter(([, , body]) => /^\s+sellerId\s/m.test(body))
      .map(([, name]) => name);

    expect(models.length).toBeGreaterThan(10);
    expect([...TENANT_MODELS].sort()).toEqual(withSellerId.sort());
    expect(TENANT_MODELS.has('Seller')).toBe(false);
  });
});

describe('scopeArgs', () => {
  it('adds the seller to reads, including queries without a where', () => {
    expect(scopeArgs('findMany', undefined, A)).toEqual({
      where: { sellerId: A },
    });
    expect(scopeArgs('count', { where: { isActive: true } }, A)).toEqual({
      where: { isActive: true, sellerId: A },
    });
    expect(
      scopeArgs('findUnique', { where: { id: 'x' }, select: { id: true } }, A),
    ).toEqual({
      where: { id: 'x', sellerId: A },
      select: { id: true },
    });
  });

  it('adds the seller to updates and deletes', () => {
    for (const operation of ['update', 'updateMany', 'delete', 'deleteMany']) {
      expect(scopeArgs(operation, { where: { id: 'x' } }, A).where).toEqual({
        id: 'x',
        sellerId: A,
      });
    }
  });

  it('sets sellerId on creates, single and many', () => {
    expect(scopeArgs('create', { data: { name: 'x' } }, A)).toEqual({
      data: { name: 'x', sellerId: A },
    });
    expect(
      scopeArgs(
        'createMany',
        { data: [{ name: 'x' }, { name: 'y', sellerId: A }] },
        A,
      ),
    ).toEqual({
      data: [
        { name: 'x', sellerId: A },
        { name: 'y', sellerId: A },
      ],
    });
  });

  it('scopes upserts on both the lookup and the create', () => {
    expect(
      scopeArgs(
        'upsert',
        { where: { id: 'x' }, create: { name: 'x' }, update: {} },
        A,
      ),
    ).toEqual({
      where: { id: 'x', sellerId: A },
      create: { name: 'x', sellerId: A },
      update: {},
    });
  });

  it("refuses another seller's id anywhere", () => {
    expect(() => scopeArgs('findMany', { where: { sellerId: B } }, A)).toThrow(
      CrossTenantError,
    );
    expect(() =>
      scopeArgs(
        'findUnique',
        { where: { sellerId_slug: { sellerId: B, slug: 's' } } },
        A,
      ),
    ).toThrow(CrossTenantError);
    expect(() => scopeArgs('create', { data: { sellerId: B } }, A)).toThrow(
      CrossTenantError,
    );
    expect(() =>
      scopeArgs('update', { where: { id: 'x' }, data: { sellerId: B } }, A),
    ).toThrow(CrossTenantError);
    expect(() =>
      scopeArgs(
        'upsert',
        { where: { id: 'x' }, create: {}, update: { sellerId: B } },
        A,
      ),
    ).toThrow(CrossTenantError);
  });

  it('refuses filters that could match several sellers', () => {
    expect(() =>
      scopeArgs('findMany', { where: { sellerId: { in: [A, B] } } }, A),
    ).toThrow(CrossTenantError);
  });

  it('accepts compound keys and explicit ids of the current seller', () => {
    expect(
      scopeArgs(
        'findUnique',
        { where: { sellerId_slug: { sellerId: A, slug: 's' } } },
        A,
      ).where,
    ).toEqual({ sellerId_slug: { sellerId: A, slug: 's' }, sellerId: A });
    expect(scopeArgs('create', { data: { sellerId: A } }, A).data).toEqual({
      sellerId: A,
    });
  });

  it('refuses relation-style writes that bypass sellerId', () => {
    expect(() =>
      scopeArgs('create', { data: { seller: { connect: { id: B } } } }, A),
    ).toThrow(CrossTenantError);
  });

  it('does not touch the caller arguments', () => {
    const args = { where: { id: 'x' } };
    scopeArgs('findUnique', args, A);
    expect(args).toEqual({ where: { id: 'x' } });
  });
});
