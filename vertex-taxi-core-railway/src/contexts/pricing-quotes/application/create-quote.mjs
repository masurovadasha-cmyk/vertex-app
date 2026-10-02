import {calculateFareMinor,PRICING_VERSION} from "../domain/pricing.mjs";

export function createQuoteService({quoteRepository,clock=()=>new Date()}){
  return async function createQuote(input,{ttlMinutes=5,currency="USD"}={}){
    const fareMinor=calculateFareMinor(input);
    const now=clock();
    const expiresAt=new Date(now.getTime()+ttlMinutes*60_000);
    return quoteRepository.insert({
      ...input,fareMinor,currency,pricingVersion:PRICING_VERSION,expiresAt
    });
  };
}
