const SERVICE_CLASSES=Object.freeze(["start","comfort","business"]);
export function serviceClasses(){return SERVICE_CLASSES}

// Pricing v1 intentionally preserves the already verified staging behavior.
// Class-specific pricing will be introduced as a separate version/feature flag.
export function calculateFareMinor({distanceKm,serviceClass}){
  if(!Number.isFinite(distanceKm)||distanceKm<=0||distanceKm>500) throw new Error("invalid_distance");
  if(!SERVICE_CLASSES.includes(serviceClass)) throw new Error("invalid_service_class");
  const tenths=Math.round(distanceKm*10);
  if(tenths<=50) return 500;
  if(tenths<=100) return 1000;
  return 1000+(tenths-100)*15;
}
export const PRICING_VERSION=1;
