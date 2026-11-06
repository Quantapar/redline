// Motion's DOM animation features, split into their own chunk. Components that
// only need initial/animate/transition render `m.*` inside <LazyMotion> and load
// this on demand, instead of the full `motion` component pulling the whole
// engine into the page's first-load bundle.
export { domAnimation as default } from 'motion/react';
