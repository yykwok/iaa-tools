import {inspect} from "./bundle.js?v=ads1";
self.onmessage=async ({data})=>{
  try { self.postMessage({result:await inspect(data)}); }
  catch(error) { self.postMessage({error:error.message}); }
};
