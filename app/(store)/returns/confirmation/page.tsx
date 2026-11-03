import { redirect } from 'next/navigation';

// Old confirmation URL; returns now go through the contact form.
export default function Page() {
  redirect('/contact?subject=Return%20request');
}
