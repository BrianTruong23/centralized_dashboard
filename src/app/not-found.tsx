import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-[#fafafa] dark:bg-gray-900">
      <h1 className="text-4xl font-bold mb-4 text-gray-900 dark:text-gray-100">404</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8">Page not found</p>
      <Link 
        href="/" 
        className="bg-black dark:bg-white text-white dark:text-black px-6 py-3 rounded-lg hover:bg-gray-800 dark:hover:bg-gray-200 transition-colors"
      >
        Go Home
      </Link>
    </div>
  );
}
