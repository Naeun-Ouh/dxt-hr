import type {PaymentCard} from './types';
export const cardLabel=(card:Pick<PaymentCard,'issuer'|'nickname'|'last4'>)=>`${card.issuer} · ${card.nickname} · ${card.last4}`;
export function cardValues(value:unknown):{issuer:string;nickname:string;last4:string;active:boolean} {
 if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!['issuer','nickname','last4','active'].includes(k)))throw new Error('카드 입력 형식을 확인해 주세요.');
 const v=value as Record<string,unknown>;
 if(['issuer','nickname'].some(k=>typeof v[k]!=='string'||!(v[k] as string).trim()||(v[k] as string).trim().length>50||/[0-9][0-9 -]{11,}[0-9]/.test(v[k] as string))||typeof v.last4!=='string'||!/^\d{4}$/.test(v.last4)||typeof v.active!=='boolean')throw new Error('카드사·별칭과 끝 4자리만 입력해 주세요. 전체 카드번호는 입력하지 마세요.');
 return {issuer:(v.issuer as string).trim(),nickname:(v.nickname as string).trim(),last4:v.last4,active:v.active};
}
