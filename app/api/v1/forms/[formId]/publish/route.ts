import { ApiError, apiRoute, json, ownedForm } from "@/lib/api/handler"
import { formToApi } from "@/lib/api/serializers"
import { EntitlementError } from "@/lib/entitlements"
import { publishFormRecord } from "@/lib/forms/service"

export const runtime = "nodejs"

/** Publishes the current draft as a new immutable version. */
export const POST = apiRoute<{ formId: string }>("forms:write", async (ctx, { formId }) => {
  const form = await ownedForm(ctx, formId, "form.publish")
  try {
    const { form: updated, version } = await publishFormRecord(form)
    return json({ data: { ...formToApi(updated), version } })
  } catch (e) {
    if (e instanceof EntitlementError) throw e
    throw new ApiError(422, "cannot_publish", e instanceof Error ? e.message : "Cannot publish this form.")
  }
})
