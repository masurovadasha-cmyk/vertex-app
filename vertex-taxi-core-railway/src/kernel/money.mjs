export function money(minor,currency="UZS"){
  if(!Number.isSafeInteger(minor)) throw new Error("money_minor_integer_required");
  if(!/^[A-Z]{3}$/.test(currency)) throw new Error("currency_iso4217_required");
  return Object.freeze({minor,currency});
}
export function addMoney(a,b){
  if(a.currency!==b.currency) throw new Error("currency_mismatch");
  return money(a.minor+b.minor,a.currency);
}
