export interface PearlImage {
  src: string;
  alt: string;
}

export interface PearlLink {
  label: string;
  url: string;
}

export interface PearlReview {
  quote: string;
  name?: string;
  rating?: number;
}

export interface PearlIconItem {
  icon: string;
  title: string;
  body?: string;
  url?: string;
}
