"use server";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireCapability } from "@/lib/auth/access";
import { can } from "@/lib/permissions";
import { employeeClient, getEmployee, privateRecord, birthRecord } from "@/lib/employees/data";
import { birthInput, employeeInput, isUuid, organizationInput, privateInput, ValidationError, versionFrom } from "@/lib/employees/validation";
import { encryptHr, decryptHr } from "@/lib/employees/crypto-server";
import { emptyPrivate, PRIVATE_FIELDS, type FormState, type PrivateValues } from "@/lib/employees/types";
function errorState(error: unknown): FormState {
  if (error instanceof ValidationError) return { error: error.message, fields: error.fields };
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  if (code === "23505") return { error: "이미 등록된 정보입니다. 이메일 또는 조직명을 확인해 주세요." };
  if (code === "40001") return { error: "다른 사용자가 정보를 변경했습니다. 새로고침 후 다시 시도해 주세요." };
  if (code === "23503" || code === "23514") return { error: "입력한 부서 또는 정보의 형식을 확인해 주세요." };
  // Never return database/crypto error text: it can contain private input or ciphertext.
  return { error: "정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." };
}
export async function saveEmployee(id: string | null, _previous: FormState, form: FormData): Promise<FormState> {
  const principal = await requireCapability("EMPLOYEE_MANAGE", "/admin/employees");
  if (id && !isUuid(id)) return { error: "직원을 찾을 수 없습니다." };
  const employeeId = id || randomUUID();
  try {
    const profile = employeeInput(form), version = versionFrom(form), birth = birthInput(form);
    if ((!id && version !== 0) || (id && version < 1)) throw new ValidationError({ version: "화면을 새로고침해 주세요." });
    const hasPrivateInput = PRIVATE_FIELDS.some(field => Boolean(form.get(field)));
    if (hasPrivateInput && (!can(principal, "PRIVATE_HR_ACCESS") || id)) return { error: "이 정보는 저장할 수 없습니다." };
    const privateValues = hasPrivateInput ? privateInput(form, emptyPrivate()) : null;
    const { error } = await (await employeeClient()).rpc("save_employee_profile", {
      p_id: employeeId, p_profile: profile, p_expected_version: version,
      p_birth_ciphertext: birth ? encryptHr(birth, `${employeeId}:birth`) : null,
      p_clear_birth: form.get("clear_birth") === "on",
      p_private_ciphertext: privateValues ? encryptHr(JSON.stringify(privateValues), `${employeeId}:private`) : null,
    });
    if (error) return errorState(error);
  } catch (error) { return errorState(error); }
  revalidatePath("/people"); revalidatePath("/organization"); revalidatePath("/admin/employees", "page");
  revalidatePath(`/admin/employees/${employeeId}`); revalidatePath(`/people/${employeeId}`);
  revalidatePath(`/admin/employees/${employeeId}/edit`); revalidatePath(`/admin/employees/${employeeId}/private`);
  redirect(`/admin/employees/${employeeId}?saved=1`);
}
export async function savePrivate(id: string, _previous: FormState, form: FormData): Promise<FormState> {
  await requireCapability("PRIVATE_HR_ACCESS", `/admin/employees/${id}/private`);
  await getEmployee(id);
  const record = await privateRecord(id);
  try {
    const version = versionFrom(form);
    if (version !== (record?.version || 0)) return errorState({ code: "40001" });
    const existing = record ? JSON.parse(decryptHr(record.encrypted_payload, `${id}:private`)) as PrivateValues : emptyPrivate();
    const values = privateInput(form, existing);
    const { error } = await (await employeeClient()).rpc("save_private_hr", { p_employee_id: id, p_ciphertext: encryptHr(JSON.stringify(values), `${id}:private`), p_expected_version: version });
    if (error) return errorState(error);
  } catch (error) { return errorState(error); }
  revalidatePath(`/admin/employees/${id}/private`);
  redirect(`/admin/employees/${id}/private?saved=1`);
}
export async function revealPrivate(id: string): Promise<{ values?: PrivateValues; birth?: string; error?: string }> {
  await requireCapability("PRIVATE_HR_ACCESS", `/admin/employees/${id}/private`);
  await getEmployee(id);
  try {
    const record = await privateRecord(id), birth = await birthRecord(id);
    const values = record ? JSON.parse(decryptHr(record.encrypted_payload, `${id}:private`)) as PrivateValues : emptyPrivate();
    const date = birth ? decryptHr(birth.birth_date_encrypted, `${id}:birth`) : "";
    const { error } = await (await employeeClient()).rpc("record_private_hr_view", { p_employee_id: id });
    if (error) return { error: "열람 기록을 저장하지 못했습니다. 다시 시도해 주세요." };
    return { values, birth: date };
  } catch { return { error: "민감정보를 열람하지 못했습니다. 관리자에게 문의해 주세요." }; }
}
export async function saveOrganization(id: string | null, _previous: FormState, form: FormData): Promise<FormState> {
  await requireCapability("EMPLOYEE_MANAGE", "/organization");
  if (id && !isUuid(id)) return { error: "조직을 찾을 수 없습니다." };
  try {
    const input = organizationInput(form), version = versionFrom(form);
    const client = await employeeClient();
    const { data, error } = id
      ? await client.from("organization").update({ ...input, version: version + 1 }).eq("id", id).eq("version", version).select("id")
      : await client.from("organization").insert({ id: randomUUID(), ...input }).select("id");
    if (error) return errorState(error);
    if (!data?.length) return errorState({ code: "40001" });
  } catch (error) { return errorState(error); }
  revalidatePath("/organization"); revalidatePath("/people"); revalidatePath("/admin/employees");
  redirect("/organization?saved=1");
}

export async function revealBirth(id: string): Promise<{ value?: string; error?: string }> {
  await requireCapability("EMPLOYEE_MANAGE", `/admin/employees/${id}/edit`);
  await getEmployee(id);
  try {
    const record = await birthRecord(id);
    const value = record ? decryptHr(record.birth_date_encrypted, `${id}:birth`) : "";
    const { error } = await (await employeeClient()).rpc("record_birth_view", { p_employee_id: id });
    if (error) return { error: "열람 기록을 저장하지 못했습니다." };
    return { value: value || "미등록" };
  } catch { return { error: "생년월일을 열람하지 못했습니다." }; }
}
