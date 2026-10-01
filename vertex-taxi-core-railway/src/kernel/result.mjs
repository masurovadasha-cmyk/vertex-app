export const ok=(value)=>({ok:true,value});
export const err=(code,details={})=>({ok:false,error:{code,...details}});
