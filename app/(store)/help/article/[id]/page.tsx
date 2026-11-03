'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { sanitizeHtml } from '@/lib/sanitize';
import { useCMS } from '@/context/CMSContext';
import { getArticles, relatedArticles } from './help-articles-data';

export default function ArticlePage() {
  const params = useParams();
  const { getSetting } = useCMS();
  const contactEmail = getSetting('contact_email') || 'eligantstrands@gmail.com';
  const contactPhone = getSetting('contact_phone') || '0549307736';
  const articles = getArticles(contactPhone, contactEmail);
  const articleId = params?.id as string | undefined;
  const article = (articleId && articles[articleId as keyof typeof articles]) || articles['1'];
  
  const [wasHelpful, setWasHelpful] = useState<boolean | null>(null);
  const [showFeedback, setShowFeedback] = useState(false);

  const handleHelpful = (helpful: boolean) => {
    setWasHelpful(helpful);
    setShowFeedback(true);
  };

  return (
    <>
      <main className="min-h-screen bg-gray-50 py-12">
        <div className="max-w-4xl mx-auto px-4">
          <Link
            href="/help"
            className="inline-flex items-center text-gray-700 hover:text-gray-900 font-semibold mb-6 whitespace-nowrap"
          >
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Help Center
          </Link>

          <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
            <div className="mb-6 pb-6 border-b border-gray-200">
              <div className="flex items-center space-x-3 mb-4">
                <span className="px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-semibold whitespace-nowrap">
                  {article.category}
                </span>
                <span className="text-sm text-gray-500">
                  Updated {article.updated}
                </span>
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-4">{article.title}</h1>
              <div className="flex items-center space-x-6 text-sm text-gray-600">
                <div className="flex items-center space-x-2">
                  <i className="ri-eye-line"></i>
                  <span>{article.views.toLocaleString()} views</span>
                </div>
                <div className="flex items-center space-x-2">
                  <i className="ri-thumb-up-line"></i>
                  <span>{article.helpful} found this helpful</span>
                </div>
              </div>
            </div>

            <article
              className="prose prose-gray max-w-none"
              dangerouslySetInnerHTML={{ __html: sanitizeHtml(article.content) }}
              style={{
                lineHeight: '1.8'
              }}
            />
          </div>

          <div className="bg-white rounded-xl shadow-sm p-8 mb-6">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Was this article helpful?</h3>
            {!showFeedback ? (
              <div className="flex space-x-4">
                <button
                  onClick={() => handleHelpful(true)}
                  className="flex-1 py-3 px-6 border-2 border-gray-700 text-gray-700 hover:bg-gray-700 hover:text-white rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  <i className="ri-thumb-up-line mr-2"></i>
                  Yes, it was helpful
                </button>
                <button
                  onClick={() => handleHelpful(false)}
                  className="flex-1 py-3 px-6 border-2 border-gray-300 text-gray-700 hover:bg-gray-100 rounded-lg font-semibold transition-colors whitespace-nowrap"
                >
                  <i className="ri-thumb-down-line mr-2"></i>
                  No, I need more help
                </button>
              </div>
            ) : (
              <div className="text-center">
                {wasHelpful ? (
                  <>
                    <div className="w-16 h-16 flex items-center justify-center bg-gray-100 rounded-full mx-auto mb-4">
                      <i className="ri-check-line text-3xl text-gray-700"></i>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-2">
                      Thank you for your feedback!
                    </p>
                    <p className="text-gray-600">
                      We're glad we could help. Have a great day!
                    </p>
                  </>
                ) : (
                  <>
                    <div className="w-16 h-16 flex items-center justify-center bg-blue-100 rounded-full mx-auto mb-4">
                      <i className="ri-customer-service-line text-3xl text-blue-700"></i>
                    </div>
                    <p className="text-lg font-semibold text-gray-900 mb-2">
                      Sorry we couldn't help
                    </p>
                    <p className="text-gray-600 mb-4">
                      Our support team is here for you!
                    </p>
                    <Link
                      href="/support/ticket"
                      className="inline-block bg-blue-700 hover:bg-blue-800 text-white px-6 py-3 rounded-lg font-semibold transition-colors whitespace-nowrap"
                    >
                      Contact Support
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow-sm p-8">
            <h3 className="text-xl font-bold text-gray-900 mb-6">Related Articles</h3>
            <div className="space-y-3">
              {relatedArticles.map((related) => (
                <Link
                  key={related.id}
                  href={`/help/article/${related.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 rounded-lg transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <i className="ri-file-text-line text-xl text-gray-700"></i>
                    <div>
                      <p className="font-semibold text-gray-900">{related.title}</p>
                      <p className="text-sm text-gray-600">{related.category}</p>
                    </div>
                  </div>
                  <i className="ri-arrow-right-s-line text-2xl text-gray-400"></i>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
