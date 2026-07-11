from pathlib import Path

# generate-from-meta: wrap entire POST body errors as JSON already ok; improve outer catch for unexpected
p = Path(r"src/app/api/v2/admin/images/generate-from-meta/route.ts")
t = p.read_text(encoding="utf-8")
if "export async function POST" in t and "An unexpected error" not in t:
    # wrap POST with outer try if not already - currently only inner try. Leave as is.
    pass

# generate-meta: ensure req.json failures return JSON
p2 = Path(r"src/app/api/v2/admin/images/generate-meta/route.ts")
t2 = p2.read_text(encoding="utf-8")
old = "const { concept, type, girlfriendData, outfitData, propData } = await req.json();"
new = """let concept: unknown;
    let type: unknown;
    let girlfriendData: any;
    let outfitData: any;
    let propData: any;
    try {
      const body = await req.json();
      concept = body.concept;
      type = body.type;
      girlfriendData = body.girlfriendData;
      outfitData = body.outfitData;
      propData = body.propData;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }"""
if old in t2:
    p2.write_text(t2.replace(old, new), encoding="utf-8")
    print("generate-meta body parse hardened")
else:
    print("generate-meta body already changed")

# tighten girlfriend appearance instruction slightly - already decent
print("done")
