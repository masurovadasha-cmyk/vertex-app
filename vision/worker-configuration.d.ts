/* eslint-disable */
// VISION staging environment. Taxi integration values are supplied at deploy time.
interface __BaseEnv_Env {
	VISION_ENV: "staging";
	VERTEX_TAXI_CORE?: Fetcher;
	TAXI_INTEGRATION_URL?: string;
	TAXI_INTEGRATION_PATH_PREFIX?: string;
	TAXI_INTEGRATION_KEY_ID?: string;
	TAXI_INTEGRATION_PRIVATE_JWK?: string;
}
declare namespace Cloudflare {
	interface GlobalProps { mainModule: typeof import("./backend/worker"); }
	interface Env extends __BaseEnv_Env {}
}
interface Env extends __BaseEnv_Env {}
type StringifyValues<EnvType extends Record<string, unknown>> = {
	[Binding in keyof EnvType]: EnvType[Binding] extends string ? EnvType[Binding] : string;
};
declare namespace NodeJS {
	interface ProcessEnv extends StringifyValues<Pick<Cloudflare.Env, "VISION_ENV">> {}
}
