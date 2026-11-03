import { redirect } from 'next/navigation';

// Returns are handled by the store team through the contact form.
export default function Page() {
  redirect('/contact?subject=Return%20request');
}
