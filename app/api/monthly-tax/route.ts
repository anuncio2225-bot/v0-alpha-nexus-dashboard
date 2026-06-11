import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year");

  if (!year) {
    return NextResponse.json({ error: "Year required" }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("monthly_tax_config")
    .select("*")
    .eq("user_id", user.id)
    .eq("year", parseInt(year))
    .order("month", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ configs: data });
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { year, month, tax_percentage, status } = body;

  if (!year || !month) {
    return NextResponse.json({ error: "Year and month required" }, { status: 400 });
  }

  // Upsert - insert or update if exists
  const { data, error } = await supabase
    .from("monthly_tax_config")
    .upsert(
      {
        user_id: user.id,
        year,
        month,
        tax_percentage: tax_percentage ?? 0,
        status: status ?? "pending",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,year,month" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const { year, month, tax_percentage, status } = body;

  if (!year || !month) {
    return NextResponse.json({ error: "Year and month required" }, { status: 400 });
  }

  // Check if config exists
  const { data: existing } = await supabase
    .from("monthly_tax_config")
    .select("id")
    .eq("user_id", user.id)
    .eq("year", year)
    .eq("month", month)
    .single();

  if (!existing) {
    // Create new config
    const { data, error } = await supabase
      .from("monthly_tax_config")
      .insert({
        user_id: user.id,
        year,
        month,
        tax_percentage: tax_percentage ?? 0,
        status: status ?? "pending",
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ config: data });
  }

  // Update existing
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (tax_percentage !== undefined) updateData.tax_percentage = tax_percentage;
  if (status !== undefined) updateData.status = status;

  const { data, error } = await supabase
    .from("monthly_tax_config")
    .update(updateData)
    .eq("user_id", user.id)
    .eq("year", year)
    .eq("month", month)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ config: data });
}
