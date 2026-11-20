import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      // Render may expose an internal localhost URL to the server.
      // Always send production users back to the public app URL.
      const appUrl =
        process.env.NODE_ENV === "production"
          ? "https://handyman-on-the-go.onrender.com"
          : origin;

      const requestedPath = searchParams.get("next");
      const safePath = requestedPath?.startsWith("/") && !requestedPath.startsWith("//") ? requestedPath : "/account";
      return NextResponse.redirect(new URL(safePath, appUrl));
    }
  }

  const appUrl =
    process.env.NODE_ENV === "production"
      ? "https://handyman-on-the-go.onrender.com"
      : origin;

  return NextResponse.redirect(new URL("/login?message=confirmation", appUrl));
}
