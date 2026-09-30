import assets from '../.build/public-assets.mjs';
import {publicHandler} from './public-handler.mjs';
export default {fetch:publicHandler(assets)};
