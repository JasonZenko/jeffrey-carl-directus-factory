export const pearlFixture = {
  mainHero: {
    heading: 'Jeffrey Carl DMD & Austin Brunson DMD',
    supportingText: 'Your Albany, OR Dentists',
    backgroundImage: {
      src: '/assets/bd9b8d625009_www.jeffreycarldmd.com_tpn_c_C180_img_BKG-anibanner-c180.webp',
      alt: 'A forest landscape in Oregon',
    },
    primaryCta: { label: 'Request an appointment', url: '/p/dentist-Albany-OR-Request-Appointment-p65415.asp' },
  },
  innerHero: {
    heading: 'Welcome to Our Albany Dental Practice',
    secondaryHeading: 'Serving Greater Linn County',
    body: '<p>We take great pride in providing our patients with the highest standard of care.</p>',
    image: {
      src: '/assets/a8657eecc5fc_www.jeffreycarldmd.com_tpn_c_C180_img_Dr-Jeff-Carl-office-front-01.jpg',
      alt: 'The front of the Albany dental practice',
    },
    cta: { label: 'Learn more about us', url: '/p/dentist-Albany-OR-About-Us-p65411.asp' },
  },
  flexContent: {
    heading: 'A conservative approach to care',
    body: '<p>Our conservative approach, combined with a friendly and knowledgeable staff, ensures that you’ll leave feeling confident about your dental health.</p>',
    image: {
      src: '/assets/0f07db3916d9_www.jeffreycarldmd.com_tpn_c_C180_img_Dr-Jeff-Carl-xray-review1.jpg',
      alt: 'Dr. Jeffrey Carl reviewing a dental X-ray with a patient',
    },
    imagePosition: 'right' as const,
  },
  splitContent: {
    heading: 'Care under one roof',
    body: '<p>In addition to general dental care, the practice offers Invisalign, cosmetic dentistry, implant restorations, and more.</p>',
    image: {
      src: '/assets/88453243399b_www.jeffreycarldmd.com_tpn_c_C180_img_IMG-Reception-c180.webp',
      alt: 'Reception area inside the Albany dental practice',
    },
    imagePosition: 'left' as const,
    imageWidth: 'half' as const,
    backgroundTone: 'light' as const,
  },
  reviews: {
    heading: 'Patient reviews',
    intro: 'A source-backed review rendered as an ordered child record.',
    reviews: [{
      quote: 'I have never been anything but impressed and appreciative for the staff and their treatment of me. Dr Carl is friendly, knowledgeable, and respectful.',
      name: 'Patient review',
      rating: 5,
    }],
  },
  areas: {
    heading: 'Areas served',
    intro: 'Direct links to local practice pages, independently editable and ordered in Directus.',
    areas: [
      { label: 'Albany', url: '/p/dentist-Albany-OR-Home-p466.asp' },
      { label: 'Corvallis', url: '/p/dentist-Corvallis-p72488.asp' },
      { label: 'Lebanon', url: '/p/dentist-Lebanon-p72489.asp' },
      { label: 'Jefferson', url: '/p/dentist-Jefferson-p72491.asp' },
      { label: 'Sweet Home', url: '/p/dentist-Sweet-Home-p72492.asp' },
      { label: 'Philomath', url: '/p/dentist-Philomath-p72493.asp' },
    ],
  },
  iconCircles: {
    heading: 'Our services',
    intro: 'The repeated Pearl service pattern now has explicit ordered items.',
    items: [
      { icon: 'P', title: 'Preventative Dentistry', url: '/p/dentist-Albany-OR-Family-Dentistry-p66929.asp' },
      { icon: 'R', title: 'Restorative Dentistry', url: '/p/dentist-Albany-OR-Restorative-Dentistry-p66930.asp' },
      { icon: 'C', title: 'Cosmetic Dentistry', url: '/p/dentist-Albany-OR-Cosmetic-Dentistry-p66931.asp' },
      { icon: 'I', title: 'Invisalign', url: '/p/dentist-Albany-OR-Invisalign-p66938.asp' },
    ],
  },
  highlightQuote: {
    quote: 'The final ten percent becomes repeatable when the template knows what every block is for.',
    attribution: 'Pearl template implementation principle',
    tone: 'brand' as const,
  },
  contentImage: {
    image: {
      src: '/assets/c0dbee68ebd7_www.jeffreycarldmd.com_tpn_c_C180_img_IMG-WaitRoom-c180.webp',
      alt: 'Waiting room inside the Albany dental practice',
    },
    caption: 'Standalone images remain independently editable, with required alternative text.',
    width: 'wide' as const,
    alignment: 'center' as const,
  },
};
