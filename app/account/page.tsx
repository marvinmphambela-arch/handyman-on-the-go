import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function AccountPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .maybeSingle();

  return <main style={{maxWidth:720,margin:"64px auto",padding:"24px"}}>
    <p style={{color:"#e87932",fontWeight:700}}>HANDYMAN ON THE GO</p>
    <h1>Welcome{profile?.full_name ? `, ${profile.full_name}` : ""}.</h1>
    <p>You are signed in as {profile?.role ?? "a registered user"}.</p>
    <p>Your account is connected. Job requests, handyman offers and profile management are the next development steps.</p>
    <Link href="/">Back to homepage</Link>
  </main>;
}
