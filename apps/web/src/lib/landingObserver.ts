/** Reveal landing sections slightly before they enter the viewport (better on small screens). */
export const LANDING_SECTION_IO: IntersectionObserverInit = {
  threshold: 0.06,
  rootMargin: "0px 0px 12% 0px"
};

export const LANDING_NUMBER_IO: IntersectionObserverInit = {
  threshold: 0.12,
  rootMargin: "0px 0px 6% 0px"
};
