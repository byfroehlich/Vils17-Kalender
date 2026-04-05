import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const locale = cookieStore.get("locale")?.value ?? "de";
  const validLocale = ["de", "en"].includes(locale) ? locale : "de";

  return {
    locale: validLocale,
    messages: (await import(`../../messages/${validLocale}.json`)).default,
  };
});
