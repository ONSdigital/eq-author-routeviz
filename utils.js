// stripHTML: html: string -> string
const stripHTML = (html) =>
  new DOMParser().parseFromString(html, "text/html").body.textContent || "";

// Utility functions for vector math
// vectorMagnitude: x: num, y: num -> magnitude: num
const vectorMagnitude = (x, y) => Math.sqrt(x ** 2 + y ** 2);

// vectorShorten: x: unm, y: num, Δlength: num -> [x*, y*] where |x*y*| = |xy| - Δlength
const vectorShorten = (x, y, Δlength) => {
  const length = vectorMagnitude(x, y);
  const scalingFactor = 1 - Δlength / length;
  return [x, y].map((n) => n * scalingFactor);
};

export { stripHTML, vectorShorten, vectorMagnitude };
