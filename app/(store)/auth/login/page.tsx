'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { persistAccessCookie } from '@/lib/auth-session';
import { useRecaptcha } from '@/hooks/useRecaptcha';

export default function LoginPage() {
  const router = useRouter();
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    rememberMe: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<any>({});
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const { getToken, verifying } = useRecaptcha();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setAuthError('');
    setIsLoading(true);

    // Validation
    const newErrors: any = {};
    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email';
    }
    if (!formData.password) {
      newErrors.password = 'Password is required';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      setIsLoading(false);
      return;
    }

    // reCAPTCHA verification
    const isHuman = await getToken('login');
    if (!isHuman) {
      setAuthError('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: formData.email,
        password: formData.password,
      });

      if (error) {
        throw error;
      }

      if (data.session) {
        persistAccessCookie(data.session.access_token, data.session.expires_in);
        router.push('/account');
        router.refresh();
      } else {
        setAuthError('Sign in did not start a session. Please try again.');
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setAuthError(error.message || 'Failed to sign in. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-white">
      {/* Left Side - Image & Branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900">
        <div className="absolute inset-0 bg-black/40 z-10"></div>
        <img 
          src="https://images.unsplash.com/photo-1562322140-8baeececf3df?q=80&w=2669&auto=format&fit=crop" 
          alt="Welcome" 
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="relative z-20 flex flex-col justify-between p-12 w-full text-white">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight">Luxury Strand Haven</Link>
          </div>
          <div className="mb-12">
            <blockquote className="space-y-2">
              <p className="text-lg font-medium leading-relaxed">
                "Beauty is an attitude. It's about how you carry yourself and how you present yourself to the world."
              </p>
              <footer className="text-sm text-gray-300">— The Prishane Philosophy</footer>
            </blockquote>
          </div>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-12 lg:p-24 bg-white">
        <div className="w-full max-w-md space-y-10">
          <div className="text-center lg:text-left">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900">Welcome back</h2>
            <p className="mt-2 text-gray-500">
              Please enter your details to sign in.
            </p>
          </div>

          {authError && (
            <div className="p-4 rounded-lg bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2 animate-in fade-in slide-in-from-top-2">
              <i className="ri-error-warning-fill text-lg"></i>
              {authError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-900" htmlFor="email">
                Email
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-lg outline-none transition-all duration-200 focus:bg-white focus:ring-2 focus:ring-gray-900/10 ${
                    errors.email ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-gray-900'
                  }`}
                  placeholder="name@example.com"
                />
                <i className="ri-mail-line absolute right-4 top-3.5 text-gray-400"></i>
              </div>
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium text-gray-900" htmlFor="password">
                  Password
                </label>
                <Link 
                  href="/auth/forgot-password" 
                  className="text-xs font-medium text-gray-500 hover:text-gray-900 transition-colors"
                >
                  Forgot password?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className={`w-full px-4 py-3 bg-gray-50 border rounded-lg outline-none transition-all duration-200 focus:bg-white focus:ring-2 focus:ring-gray-900/10 ${
                    errors.password ? 'border-red-500 focus:border-red-500' : 'border-gray-200 focus:border-gray-900'
                  }`}
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-3.5 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <i className={showPassword ? 'ri-eye-off-line' : 'ri-eye-line'}></i>
                </button>
              </div>
              {errors.password && <p className="text-xs text-red-500 mt-1">{errors.password}</p>}
            </div>

            <div className="flex items-center">
              <input
                id="remember-me"
                type="checkbox"
                checked={formData.rememberMe}
                onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
              />
              <label htmlFor="remember-me" className="ml-2 block text-sm text-gray-600">
                Remember me for 30 days
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading || verifying}
              className="w-full bg-gray-900 text-white py-3.5 rounded-lg font-medium hover:bg-gray-800 focus:ring-4 focus:ring-gray-900/20 transition-all disabled:opacity-70 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading || verifying ? (
                <>
                  <i className="ri-loader-4-line animate-spin"></i>
                  <span>{verifying ? 'Verifying...' : 'Signing in...'}</span>
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="bg-white px-4 text-gray-500">Or continue with</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <button disabled className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors opacity-60 cursor-not-allowed">
              <i className="ri-google-fill text-xl"></i>
              <span className="text-sm font-medium text-gray-700">Google</span>
            </button>
            <button disabled className="flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors opacity-60 cursor-not-allowed">
              <i className="ri-facebook-fill text-xl text-blue-600"></i>
              <span className="text-sm font-medium text-gray-700">Facebook</span>
            </button>
          </div>

          <p className="text-center text-sm text-gray-500">
            Don't have an account?{' '}
            <Link href="/auth/signup" className="font-semibold text-gray-900 hover:underline">
              Sign up
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
