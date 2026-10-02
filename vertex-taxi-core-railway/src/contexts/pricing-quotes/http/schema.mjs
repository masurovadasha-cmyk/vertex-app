import {z} from "zod";
import {serviceClasses} from "../domain/pricing.mjs";
export const pointSchema=z.object({
  lat:z.number().min(-90).max(90),
  lng:z.number().min(-180).max(180),
  label:z.string().min(1).max(200)
});
export const quoteInputSchema=z.object({
  userId:z.string().min(1).max(128),
  pickup:pointSchema,
  destination:pointSchema,
  serviceClass:z.enum(serviceClasses()),
  distanceKm:z.number().positive().max(500)
});
