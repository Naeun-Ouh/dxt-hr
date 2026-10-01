import { ASSET_STATUSES,ASSET_TYPES,type VaultKind } from './types';
import { isUuid } from '../employees/validation';
export function textField(form:FormData,key:string,max:number,required=false) {
 const raw=form.get(key);if(raw!==null&&typeof raw!=='string')throw new Error('입력 형식을 확인해 주세요.');
 const value=String(raw??'').trim();if(value.length>max||(required&&!value))throw new Error('필수 항목과 입력 길이를 확인해 주세요.');return value;
}
function uuidField(form:FormData,key:string){const value=textField(form,key,36);if(value&&!isUuid(value))throw new Error('선택 항목을 확인해 주세요.');return value||null;}
export function assetInput(form:FormData){
 const type=textField(form,'type',30),status=textField(form,'status',30),current_holder_id=uuidField(form,'current_holder_id');
 if(!Object.hasOwn(ASSET_TYPES,type)||!Object.hasOwn(ASSET_STATUSES,status))throw new Error('유형과 상태를 확인해 주세요.');
 if(status==='IN_USE'&&!current_holder_id)throw new Error('사용중인 장비는 보유자를 선택해 주세요.');
 if(['AVAILABLE','DISPOSED'].includes(status)&&current_holder_id)throw new Error('보유·폐기 상태로 변경하려면 보유자를 반납으로 변경해 주세요.');
 return {type,status,current_holder_id,manufacturer:textField(form,'manufacturer',100),model:textField(form,'model',200),serial_number:textField(form,'serial_number',100,true)};
}
export function vaultInput(form:FormData,kind:VaultKind,isNew:boolean){
 const name=textField(form,'name',200,true),login_id=kind==='account'?textField(form,'login_id',200,true):'',url=kind==='account'?textField(form,'url',2000):'',memo=textField(form,'memo',2000);
 if(url){let parsed:URL;try{parsed=new URL(url);}catch{throw new Error('http 또는 https URL을 입력해 주세요.');}if(!['http:','https:'].includes(parsed.protocol)||parsed.username||parsed.password)throw new Error('로그인 정보가 포함되지 않은 http 또는 https URL을 입력해 주세요.');}
 const raw=form.get('secret');if(raw!==null&&typeof raw!=='string')throw new Error('비밀값 입력을 확인해 주세요.');
 // Password whitespace is significant. Never trim or echo it in validation errors.
 let secret=String(raw??'');if(kind==='windows')secret=secret.trim().toUpperCase();
 if((isNew&&!secret)||secret.length>4096||(kind==='windows'&&secret&&!/^[A-Z0-9]{5}(-[A-Z0-9]{5}){4}$/.test(secret)))throw new Error(kind==='windows'?'제품키는 5자리씩 하이픈으로 구분한 25자입니다.':'비밀번호를 1~4096자로 입력해 주세요.');
 return {secret,values:{name,login_id,url,memo,device_asset_id:kind==='windows'?uuidField(form,'device_asset_id'):null,assigned_employee_id:kind==='windows'?uuidField(form,'assigned_employee_id'):null,key_suffix:kind==='windows'&&secret?secret.slice(-5):''}};
}
