'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import MiniCart from './MiniCart';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { useCMS } from '@/context/CMSContext';
import AnnouncementBar from './AnnouncementBar';

type MobileNavLink = { label: string; href: string };
type MobileNavItem =
  | MobileNavLink
  | { label: string; href: string; children: MobileNavLink[] };

function isNavItemWithChildren(item: MobileNavItem): item is { label: string; href: string; children: MobileNavLink[] } {
  return 'children' in item && Array.isArray((item as { children?: unknown }).children);
}

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [wishlistCount, setWishlistCount] = useState(0);
  const [user, setUser] = useState<any>(null);
  const [expandedMobileSection, setExpandedMobileSection] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);
  const [mobileNavItems, setMobileNavItems] = useState<MobileNavItem[]>([
    { label: 'Shop', href: '/shop' },
    { label: 'Academia (Online Classes)', href: '/academia' },
  ]);

  const { cartCount, isCartOpen, setIsCartOpen } = useCart();
  const { getSetting, getSettingJSON } = useCMS();

  const siteName = getSetting('site_name') || 'Luxury Strand Haven';
  const siteLogo = '/new.png';
  const logoHeight = getSetting('header_logo_height') || '44';
  const showSearch = getSetting('header_show_search') !== 'false';
  const showWishlist = getSetting('header_show_wishlist') !== 'false';
  const showCart = getSetting('header_show_cart') !== 'false';
  const showAccount = getSetting('header_show_account') !== 'false';
  const savedNavLinks = getSettingJSON<{ label: string; href: string }[]>('header_nav_links_json', [
    { label: 'Home', href: '/' },
    { label: 'Shop', href: '/shop' },
    { label: 'Categories', href: '/categories' },
    { label: 'Academia', href: '/academia' },
    { label: 'About', href: '/about' },
    { label: 'Contact', href: '/contact' }
  ]);
  const navLinks = [
    ...(savedNavLinks.some(l => l.href === '/') ? [] : [{ label: 'Home', href: '/' }]),
    ...savedNavLinks,
  ];
  if (!navLinks.some((link) => link.href === '/academia' || link.href.startsWith('/academia/'))) {
    const aboutIndex = navLinks.findIndex((link) => link.href === '/about');
    const academiaLink = { label: 'Academia', href: '/academia' };
    if (aboutIndex >= 0) navLinks.splice(aboutIndex, 0, academiaLink);
    else navLinks.push(academiaLink);
  }

  useEffect(() => {
    const updateWishlistCount = () => {
      const wishlist = JSON.parse(localStorage.getItem('wishlist') || '[]');
      setWishlistCount(wishlist.length);
    };
    updateWishlistCount();
    window.addEventListener('wishlistUpdated', updateWishlistCount);

    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
    };
    checkUser();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });
    return () => {
      window.removeEventListener('wishlistUpdated', updateWishlistCount);
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    async function fetchCategories() {
      const { data } = await supabase
        .from('categories')
        .select('id, name, slug, parent_id')
        .eq('status', 'active')
        .order('name');
      if (!data) return;

      const parentsBySlug = new Map(data.filter(c => !c.parent_id).map(c => [c.slug, c]));
      const childrenByParentId = new Map<string, typeof data>();
      data.filter(c => c.parent_id).forEach((child) => {
        const parentId = child.parent_id as string;
        const existing = childrenByParentId.get(parentId) || [];
        childrenByParentId.set(parentId, [...existing, child]);
      });

      const makeParentItem = (
        slug: string,
        label: string,
        options?: { excludeChildSlug?: string }
      ): MobileNavItem | null => {
        const parent = parentsBySlug.get(slug);
        if (!parent) return null;
        const children = (childrenByParentId.get(parent.id) || [])
          .filter(child => !options?.excludeChildSlug || child.slug !== options.excludeChildSlug)
          .map(child => ({ label: child.name, href: `/shop?category=${child.slug}` }));

        if (children.length > 0) return { label, href: `/shop?category=${parent.slug}`, children };
        return { label, href: `/shop?category=${parent.slug}` };
      };

      const orderedItems: MobileNavItem[] = [{ label: 'Shop', href: '/shop' }];
      const wigsItem = makeParentItem('wigs', 'Wigs');
      const bundlesItem = makeParentItem('bundles', 'Bundles');
      const closureItem = makeParentItem('closure-frontals', 'Closure and frontal');
      const braidingItem = makeParentItem('braiding-extensions', 'Braiding Extensions');
      const toolsItem = makeParentItem('products-tools', 'Products and tools');
      const preOrderItem = makeParentItem('pre-orders', 'Pre order');

      if (wigsItem) orderedItems.push(wigsItem);
      if (bundlesItem) orderedItems.push(bundlesItem);
      if (closureItem) orderedItems.push(closureItem);
      if (braidingItem) orderedItems.push(braidingItem);
      if (toolsItem) orderedItems.push(toolsItem);
      if (preOrderItem) orderedItems.push(preOrderItem);
      orderedItems.push({ label: 'Academia', href: '/academia' });

      const items = orderedItems;
      setMobileNavItems(items);
    }
    fetchCategories();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      window.location.href = `/shop?search=${encodeURIComponent(searchQuery)}`;
    }
  };

  return (
    <>
      <AnnouncementBar />

      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between h-16">
            {/* Left: mobile menu + logo */}
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                className="lg:hidden p-2 -ml-2 text-gray-600 hover:text-gray-900"
                onClick={() => setIsMobileMenuOpen(true)}
                aria-label="Open menu"
              >
                <i className="ri-menu-line text-xl" aria-hidden />
              </button>
              <Link href="/" className="flex items-center shrink-0 min-h-[2.5rem]" aria-label={siteName + ' home'}>
                {!logoError ? (
                  <img
                    src={siteLogo}
                    alt=""
                    className="h-10 w-auto object-contain"
                    style={{ maxHeight: `${logoHeight}px` }}
                    onError={() => setLogoError(true)}
                  />
                ) : (
                  <span className="text-lg font-semibold text-gray-900">{siteName}</span>
                )}
              </Link>
            </div>

            {/* Center: nav (desktop) */}
            <nav className="hidden lg:flex items-center justify-center gap-8" aria-label="Main navigation">
              {navLinks.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900 tracking-wide"
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Right: search, wishlist, account, cart */}
            <div className="flex items-center gap-1 sm:gap-2">
              {showSearch && (
                <button
                  type="button"
                  className="p-2 text-gray-600 hover:text-gray-900"
                  onClick={() => setIsSearchOpen(true)}
                  aria-label="Search"
                >
                  <i className="ri-search-line text-xl" aria-hidden />
                </button>
              )}
              {showWishlist && (
                <Link
                  href="/wishlist"
                  className="p-2 text-gray-600 hover:text-gray-900 relative"
                  aria-label={wishlistCount > 0 ? `Wishlist, ${wishlistCount} items` : 'Wishlist'}
                >
                  <i className="ri-heart-line text-xl" aria-hidden />
                  {wishlistCount > 0 && (
                    <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 bg-gray-900 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                      {wishlistCount}
                    </span>
                  )}
                </Link>
              )}
              {showAccount && (
                user ? (
                  <Link
                    href="/account"
                    className="p-2 text-gray-600 hover:text-gray-900 hidden sm:block"
                    aria-label="Account"
                  >
                    <i className="ri-user-line text-xl" aria-hidden />
                  </Link>
                ) : (
                  <Link
                    href="/auth/login"
                    className="p-2 text-gray-600 hover:text-gray-900 hidden sm:block"
                    aria-label="Log in"
                  >
                    <i className="ri-user-line text-xl" aria-hidden />
                  </Link>
                )
              )}
              {showCart && (
                <div className="relative">
                  <button
                    type="button"
                    className="p-2 text-gray-600 hover:text-gray-900 relative"
                    onClick={() => setIsCartOpen(!isCartOpen)}
                    aria-label={cartCount > 0 ? `Cart, ${cartCount} items` : 'Cart'}
                    aria-expanded={isCartOpen}
                    aria-controls="mini-cart"
                  >
                    <i className="ri-shopping-cart-line text-xl" aria-hidden />
                    {cartCount > 0 && (
                      <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 bg-gray-900 text-white text-[10px] font-medium rounded-full flex items-center justify-center">
                        {cartCount}
                      </span>
                    )}
                  </button>
                  <MiniCart isOpen={isCartOpen} onClose={() => setIsCartOpen(false)} />
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Search overlay */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-[60] bg-white" role="dialog" aria-modal="true" aria-label="Search">
          <div className="max-w-2xl mx-auto px-4 pt-6 pb-4">
            <div className="flex items-center gap-3 border-b border-gray-200 pb-4">
              <i className="ri-search-line text-2xl text-gray-400" aria-hidden />
              <form onSubmit={handleSearch} className="flex-1">
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  className="w-full py-2 text-lg focus:outline-none placeholder:text-gray-400"
                  autoFocus
                  autoComplete="off"
                />
              </form>
              <button
                type="button"
                className="p-2 text-gray-500 hover:text-gray-900"
                onClick={() => setIsSearchOpen(false)}
                aria-label="Close search"
              >
                <i className="ri-close-line text-2xl" aria-hidden />
              </button>
            </div>
            <p className="text-sm text-gray-500 mt-2">Press Enter to search</p>
          </div>
        </div>
      )}

      {/* Mobile menu */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div
            className="absolute inset-0 bg-black/20"
            onClick={() => setIsMobileMenuOpen(false)}
            aria-hidden="true"
          />
          <div className="absolute top-0 left-0 bottom-0 w-full max-w-[320px] bg-white shadow-xl flex flex-col">
            <div className="flex items-center justify-between h-16 px-4 border-b border-gray-100">
              <span className="text-sm font-medium text-gray-500">Menu</span>
              <button
                type="button"
                onClick={() => { setIsMobileMenuOpen(false); setExpandedMobileSection(null); }}
                className="p-2 text-gray-500 hover:text-gray-900"
                aria-label="Close menu"
              >
                <i className="ri-close-line text-2xl" aria-hidden />
              </button>
            </div>
            <nav className="flex-1 overflow-y-auto py-4" aria-label="Mobile navigation">
              <Link
                href="/"
                className="block px-4 py-3 text-base font-medium text-gray-900"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                Home
              </Link>
              {mobileNavItems.map((item) => {
                if (isNavItemWithChildren(item)) {
                  const isExpanded = expandedMobileSection === item.label;
                  return (
                    <div key={item.label} className="border-b border-gray-100 last:border-b-0">
                      <button
                        type="button"
                        className="flex w-full items-center justify-between px-4 py-3 text-base font-medium text-gray-900"
                        onClick={() => setExpandedMobileSection(isExpanded ? null : item.label)}
                        aria-expanded={isExpanded}
                        aria-controls={`mobile-nav-${item.label.replace(/\s+/g, '-')}`}
                      >
                        {item.label}
                        <i className={`ri-arrow-down-s-line text-xl text-gray-500 transition-transform ${isExpanded ? 'rotate-180' : ''}`} aria-hidden />
                      </button>
                      <div
                        id={`mobile-nav-${item.label.replace(/\s+/g, '-')}`}
                        className={isExpanded ? 'block' : 'hidden'}
                      >
                        {item.children.map((sub) => (
                          <Link
                            key={sub.href + sub.label}
                            href={sub.href}
                            className="block px-4 py-2.5 pl-6 text-sm font-medium text-gray-700 hover:text-gray-900"
                            onClick={() => setIsMobileMenuOpen(false)}
                          >
                            {sub.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-3 text-base font-medium text-gray-700 border-b border-gray-100"
                    onClick={() => setIsMobileMenuOpen(false)}
                  >
                    {item.label}
                  </Link>
                );
              })}
              <div className="border-t border-gray-100 my-4" />
              <Link href="/order-tracking" className="block px-4 py-3 text-sm text-gray-600" onClick={() => setIsMobileMenuOpen(false)}>
                Track order
              </Link>
              <Link href="/wishlist" className="block px-4 py-3 text-sm text-gray-600" onClick={() => setIsMobileMenuOpen(false)}>
                Wishlist
              </Link>
              <Link href={user ? '/account' : '/auth/login'} className="block px-4 py-3 text-sm text-gray-600" onClick={() => setIsMobileMenuOpen(false)}>
                {user ? 'Account' : 'Log in'}
              </Link>
            </nav>
          </div>
        </div>
      )}
    </>
  );
}
