'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import CheckoutSteps from '@/components/CheckoutSteps';
import OrderSummary from '@/components/OrderSummary';
import { useCart } from '@/context/CartContext';
import { supabase } from '@/lib/supabase';
import { usePageTitle } from '@/hooks/usePageTitle';
import { useRecaptcha } from '@/hooks/useRecaptcha';

export default function CheckoutPage() {
  usePageTitle('Checkout');
  const router = useRouter();
  const { cart, subtotal: cartSubtotal, clearCart } = useCart();

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [checkoutType, setCheckoutType] = useState<'guest' | 'account'>('guest');
  const [user, setUser] = useState<any>(null);
  const { getToken, verifying } = useRecaptcha();

  const [shippingData, setShippingData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    country: 'Ghana',
    address: '',
    city: '',
    region: ''
  });

  // Ghana regions → cities (comprehensive)
  const GHANA_REGION_CITIES: Record<string, string[]> = {
    'Greater Accra': ['Accra','Tema','Madina','Ashaiman','Kasoa','Teshie','Nungua','Adenta','Dodowa','Prampram','Ada Foah','Kpone','Lashibi','Sakumono','Dansoman','Weija','Gbawe','Amasaman','Ablekuma','Achimota','Dome','Haatso','Oyibi','Ashongman'],
    'Ashanti': ['Kumasi','Obuasi','Mampong','Ejura','Konongo','Offinso','Bekwai','Agogo','Juaso','New Edubiase','Nkawie','Tepa','Effiduase','Mankranso','Kuntenase','Asokwa','Adum','Tafo','Suame','Ahenema Kokoben','Sokoban','Buokrom'],
    'Western': ['Sekondi-Takoradi','Tarkwa','Prestea','Axim','Half Assini','Bogoso','Agona Nkwanta','Elubo','Shama','Dixcove','Nkroful','Esiama'],
    'Central': ['Cape Coast','Winneba','Saltpond','Elmina','Dunkwa-on-Offin','Agona Swedru','Mankessim','Assin Fosu','Apam','Kasoa','Buduburam','Effutu','Anomabu','Moree','Breman Asikuma','Twifo Praso'],
    'Eastern': ['Koforidua','Nkawkaw','Asamankese','Nsawam','Kibi','Akropong','Mpraeso','Akim Oda','Begoro','Suhum','Aburi','Kade','Somanya','Donkorkrom','Akwatia','Adukrom','Akoase','Kyebi'],
    'Northern': ['Tamale','Yendi','Savelugu','Bimbilla','Tolon','Kumbungu','Gushegu','Karaga','Zabzugu','Mion','Sang','Nanton'],
    'Volta': ['Ho','Keta','Aflao','Hohoe','Kpando','Anloga','Denu','Sogakope','Adidome','Akatsi','Ketu','Dzodze','Peki','Tsito','Amedzofe'],
    'Upper East': ['Bolgatanga','Navrongo','Bawku','Paga','Zebilla','Sandema','Bongo','Pusiga','Garu','Tempane','Tongo','Zuarungu'],
    'Upper West': ['Wa','Tumu','Jirapa','Lawra','Nandom','Nadowli','Lambussie','Issa','Gwollu','Funsi','Hamile','Wechiau'],
    'Ahafo': ['Goaso','Bechem','Duayaw-Nkwanta','Kukuom','Hwidiem','Kenyasi','Acherensua','Asunafo'],
    'Bono': ['Sunyani','Berekum','Dormaa Ahenkro','Wenchi','Odumase','Nsawkaw','Sampa','Drobo','Chiraa','Japekrom','Nsoatre'],
    'Bono East': ['Techiman','Kintampo','Nkoranza','Yeji','Atebubu','Kwame Danso','Prang','Tuobodom','Tanoso','Amanten','Jema'],
    'North East': ['Nalerigu','Gambaga','Walewale','Chereponi','Bunkpurugu','Yunyoo','Nakpanduri','Gbintiri'],
    'Savannah': ['Damongo','Salaga','Bole','Sawla','Buipe','Yapei','Daboya','Tolon','Larabanga','Kpandai'],
    'Oti': ['Dambai','Kadjebi','Nkwanta','Jasikan','Kpassa','Chinderi','Worawora','Bowiri'],
    'Western North': ['Sefwi Wiawso','Bibiani','Juaboso','Enchi','Akontombra','Dadieso','Bodi','Anhwiaso','Asawinso','Essam'],
  };

  const ghanaRegions = Object.keys(GHANA_REGION_CITIES);

  // Cities per country — dropdown when available, text input otherwise
  const COUNTRY_CITIES: Record<string, string[]> = {
    'Nigeria': ['Lagos','Abuja','Kano','Ibadan','Kaduna','Port Harcourt','Benin City','Maiduguri','Zaria','Aba','Jos','Ilorin','Oyo','Enugu','Abeokuta','Onitsha','Warri','Sokoto','Calabar','Uyo','Asaba','Owerri','Akure','Bauchi','Makurdi','Minna','Awka','Nnewi','Umuahia','Yola','Gombe','Lafia','Lokoja','Ado Ekiti','Ikeja'],
    'United Kingdom': ['London','Manchester','Birmingham','Leeds','Glasgow','Sheffield','Bradford','Edinburgh','Liverpool','Bristol','Cardiff','Coventry','Leicester','Nottingham','Newcastle upon Tyne','Southampton','Aberdeen','Brighton','Derby','Plymouth','Oxford','Cambridge','Exeter','York','Bath'],
    'United States': ['New York','Los Angeles','Chicago','Houston','Phoenix','Philadelphia','San Antonio','San Diego','Dallas','San Jose','Austin','Jacksonville','Fort Worth','Columbus','Charlotte','Indianapolis','San Francisco','Seattle','Denver','Nashville','Atlanta','Miami','Minneapolis','Boston','Portland','Las Vegas','Detroit','Memphis','Baltimore','Washington DC','New Orleans','Milwaukee','Albuquerque','Tucson','Fresno','Sacramento','Kansas City','Omaha','Raleigh','Colorado Springs'],
    'Canada': ['Toronto','Montreal','Calgary','Ottawa','Edmonton','Mississauga','Winnipeg','Vancouver','Brampton','Hamilton','Quebec City','Surrey','Laval','Halifax','Markham','Vaughan','Gatineau','Burnaby','Saskatoon','Kitchener','Windsor','Regina','Richmond','Richmond Hill'],
    'Australia': ['Sydney','Melbourne','Brisbane','Perth','Adelaide','Gold Coast','Newcastle','Canberra','Sunshine Coast','Wollongong','Geelong','Hobart','Townsville','Cairns','Darwin','Toowoomba','Ballarat','Bendigo','Launceston'],
    'South Africa': ['Johannesburg','Cape Town','Durban','Pretoria','Port Elizabeth','Bloemfontein','East London','Pietermaritzburg','Boksburg','Soweto','Benoni','Vanderbijlpark','Germiston','Springs','Roodepoort','Kimberley','Polokwane','Rustenburg','Nelspruit','Witbank'],
    'Kenya': ['Nairobi','Mombasa','Nakuru','Eldoret','Kisumu','Thika','Malindi','Kitale','Garissa','Nyeri','Machakos','Meru','Kakamega','Kericho','Embu'],
    'Tanzania': ['Dar es Salaam','Mwanza','Arusha','Dodoma','Mbeya','Morogoro','Tanga','Zanzibar City','Kigoma','Iringa','Moshi','Tabora'],
    'Ethiopia': ['Addis Ababa','Dire Dawa','Mekelle','Gondar','Adama','Hawassa','Bahir Dar','Dessie','Jimma','Jijiga'],
    'Cameroon': ['Douala','Yaoundé','Bafoussam','Bamenda','Garoua','Maroua','Ngaoundéré','Bertoua','Loum','Kumba'],
    "Côte d'Ivoire": ['Abidjan','Bouaké','Daloa','Yamoussoukro','San-Pédro','Korhogo','Man','Divo','Gagnoa','Abengourou'],
    'Senegal': ['Dakar','Thiès','Kaolack','Ziguinchor','Saint-Louis','Rufisque','Touba','Louga','Tambacounda'],
    'Uganda': ['Kampala','Gulu','Lira','Mbarara','Jinja','Bwizibwera','Mbale','Mukono','Kasese','Masaka'],
    'Rwanda': ['Kigali','Butare','Gisenyi','Ruhengeri','Byumba','Cyangugu','Gitarama'],
    'Zambia': ['Lusaka','Kitwe','Ndola','Kabwe','Chingola','Mufulira','Livingstone','Luanshya','Kasama'],
    'Zimbabwe': ['Harare','Bulawayo','Chitungwiza','Mutare','Gweru','Kwekwe','Kadoma','Masvingo','Chinhoyi','Norton'],
    'Germany': ['Berlin','Hamburg','Munich','Cologne','Frankfurt','Stuttgart','Düsseldorf','Leipzig','Dortmund','Essen','Bremen','Dresden','Hanover','Nuremberg','Duisburg','Bochum','Wuppertal','Bielefeld','Bonn','Münster'],
    'France': ['Paris','Marseille','Lyon','Toulouse','Nice','Nantes','Strasbourg','Montpellier','Bordeaux','Lille','Rennes','Reims','Toulon','Le Havre','Grenoble','Dijon','Nîmes','Angers'],
    'India': ['Mumbai','Delhi','Bangalore','Hyderabad','Ahmedabad','Chennai','Kolkata','Surat','Pune','Jaipur','Lucknow','Kanpur','Nagpur','Indore','Thane','Bhopal','Visakhapatnam','Patna','Vadodara','Ghaziabad','Agra','Nashik','Meerut','Faridabad'],
    'China': ['Shanghai','Beijing','Guangzhou','Shenzhen','Chengdu','Tianjin','Wuhan','Xi\'an','Hangzhou','Nanjing','Chongqing','Suzhou','Qingdao','Zhengzhou','Dongguan','Foshan','Shenyang','Harbin','Kunming','Changsha'],
    'United Arab Emirates': ['Dubai','Abu Dhabi','Sharjah','Ajman','Ras Al Khaimah','Fujairah','Al Ain'],
    'Saudi Arabia': ['Riyadh','Jeddah','Mecca','Medina','Dammam','Khobar','Tabuk','Buraidah','Abha','Najran','Jizan'],
    'Italy': ['Rome','Milan','Naples','Turin','Palermo','Genoa','Bologna','Florence','Bari','Catania','Venice','Verona','Messina','Padua','Trieste'],
    'Spain': ['Madrid','Barcelona','Valencia','Seville','Zaragoza','Málaga','Murcia','Palma','Las Palmas','Bilbao','Alicante','Córdoba','Valladolid','Vigo','Gijón'],
    'Netherlands': ['Amsterdam','Rotterdam','The Hague','Utrecht','Eindhoven','Tilburg','Groningen','Almere','Breda','Nijmegen'],
    'Belgium': ['Brussels','Antwerp','Ghent','Charleroi','Liège','Bruges','Namur','Leuven','Mons','Aalst'],
    'Portugal': ['Lisbon','Porto','Vila Nova de Gaia','Braga','Amadora','Setúbal','Coimbra','Funchal','Almada','Aveiro'],
    'Sweden': ['Stockholm','Gothenburg','Malmö','Uppsala','Västerås','Örebro','Linköping','Helsingborg','Jönköping','Norrköping'],
    'Norway': ['Oslo','Bergen','Trondheim','Stavanger','Drammen','Fredrikstad','Kristiansand','Sandnes','Tromsø','Sarpsborg'],
    'Denmark': ['Copenhagen','Aarhus','Odense','Aalborg','Frederiksberg','Esbjerg','Randers','Kolding','Horsens','Vejle'],
    'Ireland': ['Dublin','Cork','Limerick','Galway','Waterford','Drogheda','Dundalk','Swords','Bray','Navan'],
    'New Zealand': ['Auckland','Wellington','Christchurch','Hamilton','Tauranga','Napier-Hastings','Dunedin','Palmerston North','Nelson','Rotorua'],
    'Singapore': ['Singapore'],
    'Malaysia': ['Kuala Lumpur','George Town','Ipoh','Shah Alam','Petaling Jaya','Johor Bahru','Kota Kinabalu','Kuching','Subang Jaya','Selayang'],
    'Japan': ['Tokyo','Yokohama','Osaka','Nagoya','Sapporo','Fukuoka','Kobe','Kawasaki','Kyoto','Saitama','Hiroshima','Sendai','Chiba','Kitakyushu','Sakai'],
    'South Korea': ['Seoul','Busan','Incheon','Daegu','Daejeon','Gwangju','Suwon','Ulsan','Changwon','Goyang'],
    'Brazil': ['São Paulo','Rio de Janeiro','Brasília','Salvador','Fortaleza','Belo Horizonte','Manaus','Curitiba','Recife','Porto Alegre','Belém','Goiânia','Guarulhos','Campinas','São Luís'],
    'Mexico': ['Mexico City','Guadalajara','Monterrey','Puebla','Tijuana','León','Juárez','Torreón','Querétaro','San Luis Potosí','Mérida','Mexicali','Aguascalientes','Cali','Hermosillo'],
    'Argentina': ['Buenos Aires','Córdoba','Rosario','Mendoza','Tucumán','La Plata','Mar del Plata','Salta','Santa Fe','San Juan'],
    'Pakistan': ['Karachi','Lahore','Faisalabad','Rawalpindi','Islamabad','Gujranwala','Peshawar','Multan','Quetta','Hyderabad'],
    'Bangladesh': ['Dhaka','Chittagong','Sylhet','Rajshahi','Khulna','Comilla','Mymensingh','Barisal','Rangpur','Narayanganj'],
    'Egypt': ['Cairo','Alexandria','Giza','Shubra El Kheima','Port Said','Suez','Luxor','Asyut','Ismaïlia','Faiyum'],
    'Morocco': ['Casablanca','Rabat','Fez','Marrakech','Agadir','Tangier','Meknès','Oujda','Kenitra','Tetouan'],
    'Turkey': ['Istanbul','Ankara','Izmir','Bursa','Adana','Gaziantep','Konya','Antalya','Kayseri','Mersin'],
  };

  // All countries (Ghana first)
  const countries = [
    'Ghana',
    'Afghanistan', 'Albania', 'Algeria', 'Andorra', 'Angola', 'Antigua and Barbuda',
    'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Bahamas', 'Bahrain',
    'Bangladesh', 'Barbados', 'Belarus', 'Belgium', 'Belize', 'Benin', 'Bhutan',
    'Bolivia', 'Bosnia and Herzegovina', 'Botswana', 'Brazil', 'Brunei', 'Bulgaria',
    'Burkina Faso', 'Burundi', 'Cabo Verde', 'Cambodia', 'Cameroon', 'Canada',
    'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros',
    'Congo (Brazzaville)', 'Congo (Kinshasa)', 'Costa Rica', "Côte d'Ivoire", 'Croatia',
    'Cuba', 'Cyprus', 'Czech Republic', 'Denmark', 'Djibouti', 'Dominica',
    'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'Equatorial Guinea',
    'Eritrea', 'Estonia', 'Eswatini', 'Ethiopia', 'Fiji', 'Finland', 'France',
    'Gabon', 'Gambia', 'Georgia', 'Germany', 'Greece', 'Grenada', 'Guatemala',
    'Guinea', 'Guinea-Bissau', 'Guyana', 'Haiti', 'Honduras', 'Hungary', 'Iceland',
    'India', 'Indonesia', 'Iran', 'Iraq', 'Ireland', 'Israel', 'Italy', 'Jamaica',
    'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kiribati', 'Kuwait', 'Kyrgyzstan',
    'Laos', 'Latvia', 'Lebanon', 'Lesotho', 'Liberia', 'Libya', 'Liechtenstein',
    'Lithuania', 'Luxembourg', 'Madagascar', 'Malawi', 'Malaysia', 'Maldives', 'Mali',
    'Malta', 'Marshall Islands', 'Mauritania', 'Mauritius', 'Mexico', 'Micronesia',
    'Moldova', 'Monaco', 'Mongolia', 'Montenegro', 'Morocco', 'Mozambique', 'Myanmar',
    'Namibia', 'Nauru', 'Nepal', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger',
    'Nigeria', 'North Korea', 'North Macedonia', 'Norway', 'Oman', 'Pakistan', 'Palau',
    'Palestine', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru', 'Philippines',
    'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia', 'Rwanda', 'Saint Kitts and Nevis',
    'Saint Lucia', 'Saint Vincent and the Grenadines', 'Samoa', 'San Marino',
    'Sao Tome and Principe', 'Saudi Arabia', 'Senegal', 'Serbia', 'Seychelles',
    'Sierra Leone', 'Singapore', 'Slovakia', 'Slovenia', 'Solomon Islands', 'Somalia',
    'South Africa', 'South Korea', 'South Sudan', 'Spain', 'Sri Lanka', 'Sudan',
    'Suriname', 'Sweden', 'Switzerland', 'Syria', 'Taiwan', 'Tajikistan', 'Tanzania',
    'Thailand', 'Timor-Leste', 'Togo', 'Tonga', 'Trinidad and Tobago', 'Tunisia',
    'Turkey', 'Turkmenistan', 'Tuvalu', 'Uganda', 'Ukraine', 'United Arab Emirates',
    'United Kingdom', 'United States', 'Uruguay', 'Uzbekistan', 'Vanuatu', 'Vatican City',
    'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe'
  ];

  const [deliveryMethod, setDeliveryMethod] = useState('pickup');
  const [paymentMethod, setPaymentMethod] = useState<'moolre'>('moolre');
  const [errors, setErrors] = useState<any>({});



  // Check auth and cart
  useEffect(() => {
    async function checkUser() {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setUser(session.user);
        setCheckoutType('account'); // Auto-select account checkout if logged in
        // Pre-fill email if available
        setShippingData(prev => ({ ...prev, email: session.user.email || '' }));
      }
    }
    checkUser();

    // Small delay to ensure cart load
    const timer = setTimeout(() => {
      if (cart.length === 0 && !isLoading) {
        // router.push('/cart'); // Optional: redirect if empty
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [cart, router, isLoading]);

  // Scroll to top when step changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentStep]);

  // Calculate Totals
  const subtotal = cartSubtotal;
  const shippingCost = deliveryMethod === 'pickup' ? 0 : 0; // Shipping cost to be implemented from backend
  const tax = 0; // No Tax
  const total = subtotal + shippingCost + tax;

  const validateShipping = () => {
    const newErrors: any = {};
    if (!shippingData.firstName) newErrors.firstName = 'First name is required';
    if (!shippingData.lastName) newErrors.lastName = 'Last name is required';
    if (!shippingData.email) newErrors.email = 'Email is required';
    else if (!/\S+@\S+\.\S+/.test(shippingData.email)) newErrors.email = 'Invalid email';
    if (!shippingData.phone) newErrors.phone = 'Phone is required';
    if (!shippingData.country) newErrors.country = 'Country is required';
    if (!shippingData.city) newErrors.city = 'City is required';
    if (shippingData.country === 'Ghana' && !shippingData.region) newErrors.region = 'Region is required';

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleContinueToDelivery = () => {
    if (validateShipping()) {
      setCurrentStep(2);
    }
  };

  const handleContinueToPayment = async () => {
    // Skip step 3 and directly initiate payment with default method (Moolre/Mobile Money)
    await handlePlaceOrder();
  };



  const handlePlaceOrder = async () => {
    if (cart.length === 0) {
      alert('Your cart is empty');
      return;
    }

    setIsLoading(true);

    // reCAPTCHA verification
    const isHuman = await getToken('checkout');
    if (!isHuman) {
      alert('Security verification failed. Please try again.');
      setIsLoading(false);
      return;
    }

    try {
      // The server prices the cart from the database and creates the order.
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const orderRes = await fetch('/api/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          items: cart.map((item) => ({ id: item.id, quantity: item.quantity, variant: item.variant || null })),
          shipping: shippingData,
          deliveryMethod,
          paymentMethod,
        }),
      });
      const orderResult = await orderRes.json().catch(() => ({}));
      if (!orderRes.ok || !orderResult.success) {
        throw new Error(orderResult.message || 'Could not place your order');
      }
      const orderNumber: string = orderResult.orderNumber;

      // 4. Handle Payment Redirects or Completion
      if (paymentMethod === 'moolre') {
        try {
          const paymentRes = await fetch('/api/payment/moolre', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId: orderNumber,
              customerEmail: shippingData.email,
            }),
          });
          const paymentResult = await paymentRes.json();
          if (!paymentResult.success) {
            throw new Error(paymentResult.message || 'Payment initialization failed');
          }
          clearCart();
          window.location.href = paymentResult.url;
          return;
        } catch (paymentErr: any) {
          console.error('Payment Error:', paymentErr);
          alert('Failed to initialize payment: ' + paymentErr.message);
          setIsLoading(false);
          return;
        }
      }

      // 6. Clear Cart & Redirect (For COD)
      clearCart();
      router.push(`/order-success?order=${orderNumber}`);

    } catch (err: any) {
      console.error('Checkout error:', err);
      alert('Failed to place order: ' + err.message);
    } finally {
      setIsLoading(false);
    }
  };

  if (cart.length === 0 && !isLoading) {
    return (
      <main className="min-h-screen bg-gray-50 py-20">
        <div className="max-w-md mx-auto text-center px-4">
          <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <i className="ri-shopping-cart-line text-4xl text-gray-300"></i>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Your cart is empty</h1>
          <p className="text-gray-600 mb-8">Add some items to start the checkout process.</p>
          <Link href="/shop" className="inline-block bg-gray-900 text-white px-8 py-3 rounded-lg font-semibold hover:bg-gray-800 transition-colors">
            Return to Shop
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="mb-8">
          <Link href="/cart" className="text-gray-600 hover:text-gray-900 font-medium inline-flex items-center whitespace-nowrap">
            <i className="ri-arrow-left-line mr-2"></i>
            Back to Cart
          </Link>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-8">Checkout</h1>

        {currentStep === 1 && (
          <div className="mb-8 bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Checkout As</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <button
                onClick={() => !user && setCheckoutType('guest')}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${checkoutType === 'guest'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
                  } ${user ? 'opacity-50 cursor-not-allowed' : ''}`}
                disabled={!!user}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-user-line text-3xl text-gray-900"></i>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${checkoutType === 'guest' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'guest' && <i className="ri-check-line text-white text-sm"></i>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">Guest Checkout</h3>
                <p className="text-sm text-gray-600">Quick checkout without creating an account</p>
                {user && <p className="text-xs text-gray-700 mt-2">You are logged in</p>}
              </button>

              <button
                onClick={() => (user ? setCheckoutType('account') : router.push('/auth/login?redirect=/checkout'))}
                className={`p-6 rounded-xl border-2 transition-all text-left cursor-pointer ${checkoutType === 'account'
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 hover:border-gray-300'
                  }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <i className="ri-account-circle-line text-3xl text-gray-900"></i>
                  <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${checkoutType === 'account' ? 'border-gray-900 bg-gray-900' : 'border-gray-300'
                    }`}>
                    {checkoutType === 'account' && <i className="ri-check-line text-white text-sm"></i>}
                  </div>
                </div>
                <h3 className="text-lg font-bold text-gray-900 mb-2">{user ? 'My Account' : 'Sign in or create an account'}</h3>
                <p className="text-sm text-gray-600">
                  {user ? `Logged in as ${user.email}` : 'Save info, track orders & earn loyalty points'}
                </p>
              </button>
            </div>
          </div>
        )}

        <CheckoutSteps currentStep={currentStep} />

        <div className="grid lg:grid-cols-3 gap-8 mt-8">
          <div className="lg:col-span-2">
            {currentStep === 1 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Shipping Information</h2>

                  <div className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="checkout-field-1" className="block text-sm font-semibold text-gray-900 mb-2">First Name *</label>
                        <input id="checkout-field-1"
                          type="text"
                          value={shippingData.firstName}
                          onChange={(e) => setShippingData({ ...shippingData, firstName: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${errors.firstName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="John"
                        />
                        {errors.firstName && <p className="text-sm text-red-600 mt-1">{errors.firstName}</p>}
                      </div>
                      <div>
                        <label htmlFor="checkout-field-2" className="block text-sm font-semibold text-gray-900 mb-2">Last Name *</label>
                        <input id="checkout-field-2"
                          type="text"
                          value={shippingData.lastName}
                          onChange={(e) => setShippingData({ ...shippingData, lastName: e.target.value })}
                          className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${errors.lastName ? 'border-red-500' : 'border-gray-300'}`}
                          placeholder="Doe"
                        />
                        {errors.lastName && <p className="text-sm text-red-600 mt-1">{errors.lastName}</p>}
                      </div>
                    </div>

                    <div>
                      <label htmlFor="checkout-field-3" className="block text-sm font-semibold text-gray-900 mb-2">Email Address *</label>
                      <input id="checkout-field-3"
                        type="email"
                        value={shippingData.email}
                        readOnly={!!user}
                        onChange={(e) => setShippingData({ ...shippingData, email: e.target.value })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${errors.email ? 'border-red-500' : 'border-gray-300'} ${user ? 'bg-gray-100 cursor-not-allowed' : ''}`}
                        placeholder="you@example.com"
                      />
                      {errors.email && <p className="text-sm text-red-600 mt-1">{errors.email}</p>}
                    </div>

                    <div>
                      <label htmlFor="checkout-field-4" className="block text-sm font-semibold text-gray-900 mb-2">Phone Number *</label>
                      <input id="checkout-field-4"
                        type="tel"
                        value={shippingData.phone}
                        onChange={(e) => setShippingData({ ...shippingData, phone: e.target.value })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${errors.phone ? 'border-red-500' : 'border-gray-300'}`}
                        placeholder="+233 XX XXX XXXX"
                      />
                      {errors.phone && <p className="text-sm text-red-600 mt-1">{errors.phone}</p>}
                    </div>

                    {/* Country */}
                    <div>
                      <label htmlFor="checkout-field-5" className="block text-sm font-semibold text-gray-900 mb-2">Country *</label>
                      <select id="checkout-field-5"
                        value={shippingData.country}
                        onChange={(e) => setShippingData({ ...shippingData, country: e.target.value, region: '', city: '' })}
                        className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 bg-white ${errors.country ? 'border-red-500' : 'border-gray-300'}`}
                      >
                        <option value="">Select Country</option>
                        {countries.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      {errors.country && <p className="text-sm text-red-600 mt-1">{errors.country}</p>}
                    </div>

                    {/* Street Address (optional) */}
                    <div>
                      <label htmlFor="checkout-field-6" className="block text-sm font-semibold text-gray-900 mb-2">
                        Street Address <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <input id="checkout-field-6"
                        type="text"
                        value={shippingData.address}
                        onChange={(e) => setShippingData({ ...shippingData, address: e.target.value })}
                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                        placeholder="House number and street name"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Region (Ghana) or State/Province (international) — comes first */}
                      <div>
                        {shippingData.country === 'Ghana' ? (
                          <>
                            <label htmlFor="checkout-field-7" className="block text-sm font-semibold text-gray-900 mb-2">Region *</label>
                            <select id="checkout-field-7"
                              value={shippingData.region}
                              onChange={(e) => setShippingData({ ...shippingData, region: e.target.value, city: '' })}
                              className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 bg-white ${errors.region ? 'border-red-500' : 'border-gray-300'}`}
                            >
                              <option value="">Select Region</option>
                              {ghanaRegions.map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            {errors.region && <p className="text-sm text-red-600 mt-1">{errors.region}</p>}
                          </>
                        ) : (
                          <>
                            <label htmlFor="checkout-field-8" className="block text-sm font-semibold text-gray-900 mb-2">
                              State / Province <span className="text-gray-400 font-normal">(optional)</span>
                            </label>
                            <input id="checkout-field-8"
                              type="text"
                              value={shippingData.region}
                              onChange={(e) => setShippingData({ ...shippingData, region: e.target.value })}
                              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600"
                              placeholder="State or province"
                            />
                          </>
                        )}
                      </div>

                      {/* City — filtered by region for Ghana */}
                      <div>
                        <label htmlFor="checkout-field-9" className="block text-sm font-semibold text-gray-900 mb-2">City *</label>
                        {shippingData.country === 'Ghana' ? (
                          <select id="checkout-field-9"
                            value={shippingData.city}
                            onChange={(e) => setShippingData({ ...shippingData, city: e.target.value })}
                            disabled={!shippingData.region}
                            className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 bg-white ${errors.city ? 'border-red-500' : 'border-gray-300'} ${!shippingData.region ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            <option value="">{shippingData.region ? 'Select City' : 'Select a region first'}</option>
                            {(GHANA_REGION_CITIES[shippingData.region] || []).map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : COUNTRY_CITIES[shippingData.country] ? (
                          <select id="checkout-field-9"
                            value={shippingData.city}
                            onChange={(e) => setShippingData({ ...shippingData, city: e.target.value })}
                            className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 bg-white ${errors.city ? 'border-red-500' : 'border-gray-300'}`}
                          >
                            <option value="">Select City</option>
                            {COUNTRY_CITIES[shippingData.country].map((c) => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <input id="checkout-field-9"
                            type="text"
                            value={shippingData.city}
                            onChange={(e) => setShippingData({ ...shippingData, city: e.target.value })}
                            className={`w-full px-4 py-3 border-2 rounded-lg focus:ring-2 focus:ring-gray-600 focus:border-gray-600 ${errors.city ? 'border-red-500' : 'border-gray-300'}`}
                            placeholder="Enter your city"
                          />
                        )}
                        {errors.city && <p className="text-sm text-red-600 mt-1">{errors.city}</p>}
                      </div>
                    </div>

                  </div>

                  <button
                    onClick={handleContinueToDelivery}
                    className="w-full mt-6 bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer"
                  >
                    Continue to Delivery
                  </button>
                </div>


              </>
            )}

            {currentStep === 2 && (
              <>
                <div className="bg-white rounded-xl shadow-sm p-6 mb-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-6">Delivery Method</h2>
                  <div className="space-y-4">
                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'pickup' ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input
                          type="radio"
                          name="delivery"
                          value="pickup"
                          checked={deliveryMethod === 'pickup'}
                          onChange={(e) => setDeliveryMethod(e.target.value)}
                          className="w-5 h-5 text-gray-900"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">Store Pickup</p>
                          <p className="text-sm text-gray-600">Pick up from our store — Ready in 24 hours</p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">FREE</p>
                    </label>

                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'doorstep' ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input
                          type="radio"
                          name="delivery"
                          value="doorstep"
                          checked={deliveryMethod === 'doorstep'}
                          onChange={(e) => setDeliveryMethod(e.target.value)}
                          className="w-5 h-5 text-gray-900"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">Doorstep Delivery</p>
                          <p className="text-sm text-gray-600">We will contact you with the delivery cost</p>
                        </div>
                      </div>
                      <p className="font-semibold text-amber-600 text-sm">At a Cost</p>
                    </label>

                    {/* Comprehensive delivery options - to be re-enabled later
                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'accra' ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input type="radio" name="delivery" value="accra" checked={deliveryMethod === 'accra'} onChange={(e) => setDeliveryMethod(e.target.value)} className="w-5 h-5 text-gray-900" />
                        <div>
                          <p className="font-semibold text-gray-900">Accra Delivery</p>
                          <p className="text-sm text-gray-600">Delivery within Accra</p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">GH₵ 40.00</p>
                    </label>
                    <label className={`flex items-center justify-between p-4 border-2 rounded-lg cursor-pointer transition-colors ${deliveryMethod === 'outside-accra' ? 'border-gray-900 bg-gray-50' : 'border-gray-300 hover:border-gray-400'
                      }`}>
                      <div className="flex items-center space-x-4">
                        <input type="radio" name="delivery" value="outside-accra" checked={deliveryMethod === 'outside-accra'} onChange={(e) => setDeliveryMethod(e.target.value)} className="w-5 h-5 text-gray-900" />
                        <div>
                          <p className="font-semibold text-gray-900">Outside Accra Delivery</p>
                          <p className="text-sm text-gray-600">Delivery to bus stations (VIP, OA, STC, etc.)</p>
                        </div>
                      </div>
                      <p className="font-bold text-gray-900">GH₵ 30.00</p>
                    </label>
                    */}
                  </div>

                  <h2 className="text-xl font-bold text-gray-900 mt-8 mb-4">Payment Method</h2>
                  <p className="text-sm text-gray-600 mb-4">Pay securely with Mobile Money.</p>
                  <div className="grid grid-cols-1 gap-3">
                    <label
                      className="flex items-center gap-3 p-4 border-2 rounded-xl cursor-pointer transition-colors border-gray-900 bg-gray-50"
                    >
                      <input
                        type="radio"
                        name="payment"
                        value="moolre"
                        checked={true}
                        onChange={() => setPaymentMethod('moolre')}
                        className="w-5 h-5 text-gray-900 flex-shrink-0"
                      />
                      <i className="ri-smartphone-line text-xl text-gray-600 flex-shrink-0"></i>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">Mobile Money</p>
                        <p className="text-xs text-gray-600 truncate">MTN, Vodafone, AirtelTigo</p>
                      </div>
                    </label>
                  </div>

                  <div className="flex flex-col-reverse md:flex-row gap-4 mt-6">
                    <button
                      onClick={() => setCurrentStep(1)}
                      disabled={isLoading}
                      className="flex-1 border-2 border-gray-300 hover:border-gray-400 text-gray-700 py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-50"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleContinueToPayment}
                      disabled={isLoading}
                      className="flex-1 bg-gray-900 hover:bg-gray-800 text-white py-4 rounded-lg font-semibold transition-colors whitespace-nowrap cursor-pointer disabled:opacity-70 flex items-center justify-center"
                    >
                      {isLoading ? (
                        <>
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : (
                        'Pay with Mobile Money'
                      )}
                    </button>
                  </div>
                </div>


              </>
            )}

            {/* Step 3 removed - payment now initiates directly from step 2 */}
          </div>

          <div className="lg:col-span-1">
            <OrderSummary
              items={cart}
              subtotal={subtotal}
              shipping={shippingCost}
              tax={tax}
              total={total}
              deliveryMethod={deliveryMethod}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
