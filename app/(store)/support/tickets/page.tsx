import { redirect } from 'next/navigation';

// There is no ticket history yet; send people to the contact form.
export default function Page() {
  redirect('/contact?subject=Support%20request');
}
