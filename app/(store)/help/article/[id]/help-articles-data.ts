export const getArticles = (contactPhone: string, contactEmail: string) => ({
  '1': {
    id: 1,
    title: 'How do I track my order?',
    category: 'Orders & Delivery',
    views: 1247,
    helpful: 234,
    updated: 'January 15, 2024',
    content: `
      <h2>Tracking Your Order</h2>
      <p>We make it easy to track your order every step of the way. Here's how:</p>
      
      <h3>Method 1: Track via Email</h3>
      <ol>
        <li>Check your email for the order confirmation</li>
        <li>Click on the "Track Order" button in the email</li>
        <li>You'll be redirected to the tracking page with real-time updates</li>
      </ol>
      
      <h3>Method 2: Track on Website</h3>
      <ol>
        <li>Go to the <a href="/order-tracking">Order Tracking</a> page</li>
        <li>Enter your order number and email address</li>
        <li>Click "Track Order" to see your delivery status</li>
      </ol>
      
      <h3>Method 3: Track in Your Account</h3>
      <ol>
        <li>Log in to your account</li>
        <li>Go to "Order History"</li>
        <li>Click on any order to see detailed tracking information</li>
      </ol>
      
      <h2>Understanding Tracking Statuses</h2>
      <ul>
        <li><strong>Order Confirmed:</strong> We've received your order</li>
        <li><strong>Processing:</strong> We're preparing your items</li>
        <li><strong>Packaged:</strong> Your order has been packaged</li>
        <li><strong>Out for Delivery:</strong> Your order will arrive today</li>
        <li><strong>Delivered:</strong> Your order has been delivered</li>
      </ul>
      
      <h2>Need More Help?</h2>
      <p>If you can't find your tracking information or have questions about your delivery, please <a href="/support/ticket">contact our support team</a>.</p>
    `
  },
  '6': {
    id: 6,
    title: 'How do I return an item?',
    category: 'Returns & Refunds',
    views: 2341,
    helpful: 456,
    updated: 'January 20, 2024',
    content: `
      <h2>Our Return Process</h2>
      <p>We want you to love your purchase! If you're not satisfied, returns are easy.</p>
      
      <h3>Step 1: Start Your Return</h3>
      <ol>
        <li>Send us a <a href="/contact?subject=Return%20request">return request</a></li>
        <li>Enter your order number and email</li>
        <li>Select the items you want to return</li>
        <li>Choose a return reason</li>
      </ol>
      
      <h3>Step 2: Print Your Return Label</h3>
      <p>After submitting your return request, you'll receive a prepaid return label via email. Simply print it and attach it to your package.</p>
      
      <h3>Step 3: Ship Your Return</h3>
      <p>Drop off your package at any authorized shipping location. You can find locations near you on our returns page.</p>
      
      <h3>Step 4: Get Your Refund</h3>
      <p>Once we receive and inspect your return, we'll let you know if the refund was approved. If approved, you'll be refunded on your original payment method. Your bank or card company may take extra time to process it.</p>
      
      <h2>Return Policy Details</h2>
      <ul>
        <li>You have 24 hours after receiving your item to request a return (faulty, damaged, or not what you requested only—no other reasons due to hygiene)</li>
        <li>Items must be unworn/unused, with tags, in original packaging; receipt or proof of purchase required</li>
        <li>Contact us first on WhatsApp ${contactPhone} or ${contactEmail}—returns sent without requesting first are not accepted</li>
        <li>No returns on custom/personalized items, personal care/beauty, sale items, or gift cards</li>
      </ul>
      
      <h2>Exchange Instead?</h2>
      <p>Return the item first; once accepted, we'll do the exchange for the new item. You cannot request a different item than the one you purchased. See our <a href="/refund-policy">Refund Policy</a> for full details.</p>
    `
  }
});

export const relatedArticles = [
  { id: 7, title: 'What is your return policy?', category: 'Returns' },
  { id: 8, title: 'When will I get my refund?', category: 'Returns' },
  { id: 9, title: 'Can I exchange instead of return?', category: 'Returns' },
  { id: 10, title: 'How do I print a return label?', category: 'Returns' }
];
