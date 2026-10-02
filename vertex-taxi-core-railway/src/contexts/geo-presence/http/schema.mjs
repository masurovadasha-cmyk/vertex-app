import {z} from "zod";
export const locationInputSchema=z.object({
  lat:z.number().min(-90).max(90),
  lng:z.number().min(-180).max(180),
  accuracyM:z.number().positive().max(500),
  heading:z.number().min(0).max(360).optional(),
  speedMps:z.number().min(0).max(100).optional(),
  available:z.boolean().default(true),
  serviceClasses:z.array(z.enum(["start","comfort","business"])).min(1).default(["start"])
});
