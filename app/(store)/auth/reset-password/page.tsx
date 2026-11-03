'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match');
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const result = await res.json().catch(() => ({}));
      if (!res.ok || !result.success) {
        setError(result.message || 'Could not reset your password. Please try again.');
        return;
      }
      setDone(true);
    } catch {
      setError('Could not reset your password. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Reset link missing</h1>
        <p className="text-gray-600 mb-6">Open the link from your email, or ask for a new one.</p>
        <Link href="/auth/forgot-password" className="inline-block bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
          Get a new link
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-8 text-center">
        <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-6">
          <i className="ri-check-line text-3xl text-gray-900"></i>
        </div>
        <h1 className="text-2xl font-bold text-gray-900 mb-3">Password changed</h1>
        <p className="text-gray-600 mb-6">You can now sign in with your new password.</p>
        <Link href="/auth/login" className="inline-block bg-gray-900 hover:bg-gray-800 text-white px-8 py-3 rounded-lg font-semibold transition-colors">
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-8">
        <h1 className="text-4xl font-bold text-gray-900 mb-2">Choose a new password</h1>
        <p className="text-gray-600">Use at least 6 characters.</p>
      </div>
      <div className="bg-white rounded-xl shadow-sm p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="new-password" className="block text-sm font-semibold text-gray-900 mb-2">New password</label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="block text-sm font-semibold text-gray-900 mb-2">Confirm new password</label>
            <input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
            />
          </div>
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Saving...' : 'Save new password'}
          </button>
        </form>
      </div>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6">
      <div className="max-w-md w-full">
        <Suspense fallback={null}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </main>
  );
}
