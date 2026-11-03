import { redirect } from 'next/navigation';

// Support requests go through the contact form, which the store team receives.
export default function Page() {
  redirect('/contact?subject=Support%20request');
}
