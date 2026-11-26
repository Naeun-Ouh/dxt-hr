// Reasons may originate from direct authenticated RPC calls. Do not let invalid
// authenticated ciphertext hide the otherwise valid contract/signature evidence.
// Only the optional reason is isolated; body/hash verification remains strict.
export function readContractReason(envelope:string,context:string,decrypt:(value:string,context:string)=>string):string{
 try{return decrypt(envelope,context);}catch{return '사유를 확인할 수 없습니다. 담당자 확인이 필요합니다.';}
}
