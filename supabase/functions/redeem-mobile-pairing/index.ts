import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { code } = await req.json();

    if (!code) {
      return new Response(
        JSON.stringify({ error: "Missing pairing code" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Admin client with service role — needed for admin.generateLink
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Look up the pairing code (using service role to bypass RLS)
    const { data: pairing, error: pairingError } = await supabaseAdmin
      .from("mobile_pairings")
      .select("id, user_id, expires_at, redeemed_at")
      .eq("code", code)
      .single();

    if (pairingError || !pairing) {
      return new Response(
        JSON.stringify({ error: "Invalid pairing code" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if expired
    if (new Date(pairing.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Pairing code expired" }),
        { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up the user's email
    const { data: userData, error: userError } =
      await supabaseAdmin.auth.admin.getUserById(pairing.user_id);

    if (userError || !userData.user?.email) {
      return new Response(
        JSON.stringify({ error: "User not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Generate a magic link (server-side only, no email sent)
    const { data: linkData, error: linkError } =
      await supabaseAdmin.auth.admin.generateLink({
        type: "magiclink",
        email: userData.user.email,
      });

    if (linkError || !linkData.properties?.hashed_token) {
      return new Response(
        JSON.stringify({ error: "Failed to generate session link" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Mark the pairing code as redeemed
    await supabaseAdmin
      .from("mobile_pairings")
      .update({ redeemed_at: new Date().toISOString() })
      .eq("id", pairing.id);

    return new Response(
      JSON.stringify({ hashed_token: linkData.properties.hashed_token }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
