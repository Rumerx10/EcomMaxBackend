import type { HomePageContent } from './dto/home-page.dto.js';

// What a store's home page shows until staff save their own: products and categories from the
// catalogue, plain copy and no photos, so it suits any store.
export const defaultHomePage = (storeName: string): HomePageContent => ({
  hero: {
    badge: '',
    title: `Welcome to ${storeName}`,
    highlight: '',
    subtitle: 'Find what you need and order online. Pay when it arrives.',
    image: null,
    primary: { label: 'Shop now', href: '/products' },
    secondary: null,
    showProduct: true,
    featuredProductId: null,
    showCoupon: true,
  },
  sections: [
    {
      id: 'features',
      type: 'features',
      visible: true,
      items: [
        {
          icon: 'banknote',
          title: 'Pay on delivery',
          text: 'Pay in cash when your order arrives',
        },
        {
          icon: 'truck',
          title: 'Delivered nationwide',
          text: 'Packed with care, sent to your door',
        },
        {
          icon: 'message',
          title: 'Here to help',
          text: 'Ask us anything in chat',
        },
        {
          icon: 'shield',
          title: 'Genuine products',
          text: 'Straight from the brands we stock',
        },
      ],
    },
    {
      id: 'categories',
      type: 'categories',
      visible: true,
      title: 'Shop by category',
    },
    {
      id: 'popular',
      type: 'products',
      visible: true,
      title: 'Popular right now',
      subtitle: 'What our customers choose most.',
      source: 'popular',
      limit: 8,
    },
    {
      id: 'deals',
      type: 'products',
      visible: true,
      title: 'Biggest discounts',
      subtitle: 'Marked down from the regular price, while stock lasts.',
      source: 'deals',
      limit: 4,
    },
    {
      id: 'latest',
      type: 'products',
      visible: true,
      title: 'New arrivals',
      subtitle: 'The latest additions to the store.',
      source: 'latest',
      limit: 4,
    },
    {
      id: 'help',
      type: 'help',
      visible: true,
      title: 'Need a hand?',
      text: 'Our team answers product questions and order queries.',
    },
  ],
});
