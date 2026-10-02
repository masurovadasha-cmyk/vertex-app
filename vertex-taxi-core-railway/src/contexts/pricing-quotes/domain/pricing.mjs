const SERVICE_CLASSES=Object.freeze(["start","comfort","business"]);
export function serviceClasses(){return SERVICE_CLASSES}
export function calculateFareMinor({distanceKm,serviceClass}){
  if(!Number.isFinite(distanceKm)||distanceKm<=0||distanceKm>500) throw new Error("invalid_distance");
  if(!SERVICE_CLASSES.includes(serviceClass)) throw new Error("invalid_service_class");
  const tenths=Math.round(distanceKm*10);
  const base=tenths<=50?500:tenths<=100?1000:1000+(tenths-100)*15;
  const multiplier=serviceClass==="business"?1.6:serviceClass==="comfort"?1.2:1;
  return Math.round(base*multiplier);
}
export const PRICING_VERSION=2;
