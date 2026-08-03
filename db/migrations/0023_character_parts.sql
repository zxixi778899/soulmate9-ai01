-- 0023: Character Parts Library (零件化预设系统) + girlfriend genome columns
--
-- Presets are no longer finished characters: this table holds pools of base
-- "parts" (hairstyle, hair color, bust shape, body type, skin tone, face
-- shape, eye color, height). The creator forge combines one part per category
-- into a unique genome (千人千面); the generated portrait then serves as the
-- companion's identity reference for all later album photos.

CREATE TABLE IF NOT EXISTS character_parts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,
  slug TEXT NOT NULL,
  value TEXT NOT NULL,
  name_en TEXT NOT NULL,
  name_zh TEXT NOT NULL DEFAULT '',
  prompt_en TEXT NOT NULL DEFAULT '',
  persona_zh TEXT NOT NULL DEFAULT '',
  persona_en TEXT NOT NULL DEFAULT '',
  rarity VARCHAR(8) NOT NULL DEFAULT 'N',
  weight INT NOT NULL DEFAULT 100,
  genders TEXT[] NOT NULL DEFAULT '{Female,Male,Transgender}',
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS character_parts_category_slug_idx
  ON character_parts (category, slug);
CREATE INDEX IF NOT EXISTS character_parts_category_active_idx
  ON character_parts (category, is_active, sort_order);

-- ── Seed: 8 categories × 10+ parts (mirror of src/lib/character-parts.ts) ──
INSERT INTO character_parts (category, slug, value, name_en, name_zh, prompt_en, persona_zh, persona_en, rarity, weight, genders, sort_order) VALUES
-- Hairstyle (10)
('hairstyle','long-straight','Long Straight','Long Straight','长直发','long straight silky hair','一头顺滑的长直发','long straight silky hair','N',100,'{Female,Male,Transgender}',10),
('hairstyle','long-flowing','Long Flowing','Long Flowing','飘逸长发','long flowing wavy hair','飘逸的微卷长发','long flowing wavy hair','N',100,'{Female,Male,Transgender}',20),
('hairstyle','wavy-curls','Wavy Curls','Wavy Curls','波浪卷发','romantic big wavy curls','浪漫的大波浪卷发','romantic big wavy curls','N',100,'{Female,Male,Transgender}',30),
('hairstyle','high-ponytail','High Ponytail','High Ponytail','高马尾','energetic high ponytail','充满活力的高马尾','energetic high ponytail','N',100,'{Female,Male,Transgender}',40),
('hairstyle','twin-tails','Twin Tails','Twin Tails','双马尾','cute twin tails','可爱的双马尾','cute twin tails','N',100,'{Female,Transgender}',50),
('hairstyle','sleek-bob','Sleek Bob','Sleek Bob','齐肩短发','sleek chin-length bob','利落的齐肩短发','sleek chin-length bob','N',100,'{Female,Male,Transgender}',60),
('hairstyle','pixie-cut','Pixie Cut','Pixie Cut','精灵短发','sharp pixie cut','帅气的精灵短发','sharp pixie cut','N',100,'{Female,Male,Transgender}',70),
('hairstyle','side-braid','Side Braid','Side Braid','侧编发','loose side braid over shoulder','垂在肩侧的松散编发','loose side braid over shoulder','N',100,'{Female,Transgender}',80),
('hairstyle','messy-bun','Messy Bun','Messy Bun','慵懒丸子头','relaxed messy bun with loose strands','慵懒的丸子头垂着几缕碎发','relaxed messy bun with loose strands','N',100,'{Female,Male,Transgender}',90),
('hairstyle','hime-cut','Hime Cut','Hime Cut','姬发式','elegant hime cut with blunt bangs','古典的姬发式齐刘海','elegant hime cut with blunt bangs','R',100,'{Female,Transgender}',100),
-- Hair color (11 hex values aligned with buildPortraitPrompt hex map)
('hair_color','jet-black','#000000','Jet Black','乌黑','jet black hair','乌黑的发色','jet black hair','N',100,'{Female,Male,Transgender}',10),
('hair_color','dark-brown','#4a3728','Dark Brown','深棕','dark brown hair','深棕发色','dark brown hair','N',100,'{Female,Male,Transgender}',20),
('hair_color','chestnut','#6b3a2a','Chestnut Brown','栗棕','warm chestnut brown hair','温暖的栗棕发色','warm chestnut brown hair','N',100,'{Female,Male,Transgender}',30),
('hair_color','blonde','#d4a574','Blonde','亚麻金','soft blonde hair','柔和的亚麻金发色','soft blonde hair','R',100,'{Female,Male,Transgender}',40),
('hair_color','golden-blonde','#f5d742','Golden Blonde','闪耀金','bright golden blonde hair','闪耀的金色头发','bright golden blonde hair','R',70,'{Female,Male,Transgender}',50),
('hair_color','sakura-pink','#e84393','Sakura Pink','樱花粉','pastel sakura pink hair','樱花粉的发色','pastel sakura pink hair','SR',55,'{Female,Male,Transgender}',60),
('hair_color','magenta','#d946ef','Magenta','蔷薇紫红','vivid magenta hair','蔷薇紫红发色','vivid magenta hair','SR',45,'{Female,Male,Transgender}',70),
('hair_color','dream-purple','#8b5cf6','Dream Purple','梦幻紫','dreamy violet-purple hair','梦幻紫的发色','dreamy violet-purple hair','SR',50,'{Female,Male,Transgender}',80),
('hair_color','mist-blue','#3b82f6','Mist Blue','雾霾蓝','misty blue hair','雾霾蓝发色','misty blue hair','SR',45,'{Female,Male,Transgender}',90),
('hair_color','flame-red','#ef4444','Flame Red','炽红','bold flame red hair','张扬的炽红发色','bold flame red hair','R',60,'{Female,Male,Transgender}',100),
('hair_color','silver-white','#ffffff','Silver White','银白','shimmering silver white hair','银白色的头发','shimmering silver white hair','SR',40,'{Female,Male,Transgender}',110),
-- Bust shape (10, female/trans only)
('breast_shape','modest-flat','Modest','Modest','娇小平坦','modest flat chest','娇小平坦的胸型','modest flat chest','N',100,'{Female,Transgender}',10),
('breast_shape','petite-perky','Petite Perky','Petite Perky','娇小挺立','petite perky chest','娇小挺立的胸型','petite perky chest','N',100,'{Female,Transgender}',20),
('breast_shape','soft-natural','Soft Natural','Soft Natural','柔和自然','soft natural chest','柔和自然的胸型','soft natural chest','N',100,'{Female,Transgender}',30),
('breast_shape','athletic-compact','Athletic Compact','Athletic Compact','运动紧致','athletic compact chest','运动紧致的胸型','athletic compact chest','N',100,'{Female,Transgender}',40),
('breast_shape','gentle-slope','Gentle Slope','Gentle Slope','舒缓坡形','gentle sloped chest','舒缓坡形的胸型','gentle sloped chest','N',100,'{Female,Transgender}',50),
('breast_shape','teardrop','Teardrop','Teardrop','水滴形','teardrop-shaped bust','水滴形的胸型','teardrop-shaped bust','R',100,'{Female,Transgender}',60),
('breast_shape','full-round','Full Round','Full Round','饱满圆润','full round bust','饱满圆润的胸型','full round bust','R',100,'{Female,Transgender}',70),
('breast_shape','curvy-full','Curvy Full','Curvy Full','丰盈曲线','curvy full bust','丰盈的曲线胸型','curvy full bust','R',100,'{Female,Transgender}',80),
('breast_shape','generous','Generous','Generous','丰满上围','generous busty figure','丰满的上围','generous busty figure','SR',70,'{Female,Transgender}',90),
('breast_shape','voluptuous','Voluptuous','Voluptuous','傲人曲线','voluptuous busty figure','傲人的曲线胸型','voluptuous busty figure','SR',55,'{Female,Transgender}',100),
-- Body type (10)
('body_type','petite','Petite','Petite','娇小玲珑','petite compact frame','娇小玲珑的身形','petite compact frame','N',100,'{Female,Male,Transgender}',10),
('body_type','slim','Slim','Slim','纤细苗条','slim graceful figure','纤细苗条的身材','slim graceful figure','N',100,'{Female,Male,Transgender}',20),
('body_type','athletic','Athletic','Athletic','运动健美','athletic toned physique','运动健美的体态','athletic toned physique','N',100,'{Female,Male,Transgender}',30),
('body_type','dancer-lean','Dancer Lean','Dancer Lean','舞者紧致','lean dancer physique with long lines','紧致修长的舞者体态','lean dancer physique with long lines','R',100,'{Female,Male,Transgender}',40),
('body_type','curvy','Curvy','Curvy','曲线玲珑','curvy hourglass figure','曲线玲珑的身材','curvy hourglass figure','R',100,'{Female,Male,Transgender}',50),
('body_type','hourglass','Hourglass','Hourglass','沙漏身材','dramatic hourglass silhouette','教科书般的沙漏身材','dramatic hourglass silhouette','SR',65,'{Female,Male,Transgender}',60),
('body_type','busty','Busty','Busty','丰满','busty figure with soft curves','丰满柔软的身材','busty figure with soft curves','R',100,'{Female,Male,Transgender}',70),
('body_type','voluptuous','Voluptuous','Voluptuous','丰腴诱人','voluptuous lush figure','丰腴诱人的身材','voluptuous lush figure','SR',60,'{Female,Male,Transgender}',80),
('body_type','soft-plush','Soft Plush','Soft Plush','柔软微胖','soft plush huggable figure','柔软微胖的可爱身材','soft plush huggable figure','R',70,'{Female,Male,Transgender}',90),
('body_type','tall-statuesque','Tall','Tall','高挑模特','tall statuesque model frame','高挑的模特身形','tall statuesque model frame','N',100,'{Female,Male,Transgender}',100),
-- Skin tone (10)
('skin_tone','porcelain','Porcelain Fair','Porcelain Fair','瓷白','fair porcelain skin','瓷白透亮的肌肤','fair porcelain skin','N',100,'{Female,Male,Transgender}',10),
('skin_tone','ivory','Ivory Light','Ivory Light','象牙白','light ivory skin','象牙白的肌肤','light ivory skin','N',100,'{Female,Male,Transgender}',20),
('skin_tone','warm-beige','Warm Beige','Warm Beige','暖米色','warm beige skin tone','暖米色的肌肤','warm beige skin tone','N',100,'{Female,Male,Transgender}',30),
('skin_tone','honey','Honey','Honey','蜜糖色','smooth honey-toned skin','蜜糖色的柔滑肌肤','smooth honey-toned skin','R',100,'{Female,Male,Transgender}',40),
('skin_tone','golden-tan','Golden Tan','Golden Tan','金色小麦','golden sun-kissed tanned skin','金色小麦色的健康肌肤','golden sun-kissed tanned skin','R',100,'{Female,Male,Transgender}',50),
('skin_tone','olive','Olive','Olive','橄榄色','warm olive skin tone','橄榄色的肌肤','warm olive skin tone','N',100,'{Female,Male,Transgender}',60),
('skin_tone','caramel','Caramel','Caramel','焦糖','rich caramel skin','焦糖色的肌肤','rich caramel skin','R',100,'{Female,Male,Transgender}',70),
('skin_tone','bronze','Bronze','Bronze','古铜','glowing bronze skin','古铜色发亮的肌肤','glowing bronze skin','R',100,'{Female,Male,Transgender}',80),
('skin_tone','deep-brown','Deep Brown','Deep Brown','深棕','deep brown skin','深棕色的肌肤','deep brown skin','N',100,'{Female,Male,Transgender}',90),
('skin_tone','ebony','Ebony','Ebony','乌木','radiant ebony skin','乌木色光泽的肌肤','radiant ebony skin','R',100,'{Female,Male,Transgender}',100),
-- Face shape (10)
('face_shape','oval','Oval','Oval','鹅蛋脸','balanced oval face','标准的鹅蛋脸','balanced oval face','N',100,'{Female,Male,Transgender}',10),
('face_shape','round','Round','Round','圆脸','soft round face with gentle cheeks','圆润可爱的脸型','soft round face with gentle cheeks','N',100,'{Female,Male,Transgender}',20),
('face_shape','heart','Heart','Heart','心形脸','heart-shaped face with a delicate chin','精致的心形脸','heart-shaped face with a delicate chin','N',100,'{Female,Male,Transgender}',30),
('face_shape','v-line','V-Line','V-Line','V字小脸','slender V-line jaw','纤瘦的V字小脸','slender V-line jaw','R',100,'{Female,Male,Transgender}',40),
('face_shape','diamond','Diamond','Diamond','菱形脸','striking diamond face with high cheekbones','颧骨立体的菱形脸','striking diamond face with high cheekbones','R',100,'{Female,Male,Transgender}',50),
('face_shape','square','Square','Square','方脸','defined square jawline','轮廓分明的方脸','defined square jawline','N',100,'{Female,Male,Transgender}',60),
('face_shape','long','Long','Long','长脸','elegant elongated face','优雅的长脸型','elegant elongated face','N',100,'{Female,Male,Transgender}',70),
('face_shape','high-cheekbones','High Cheekbones','High Cheekbones','高颧骨','sculpted high cheekbones','高颧骨的立体轮廓','sculpted high cheekbones','R',100,'{Female,Male,Transgender}',80),
('face_shape','delicate-small','Delicate Small','Delicate Small','精致小脸','delicate small face with fine features','五官精巧的小脸','delicate small face with fine features','SR',60,'{Female,Male,Transgender}',90),
('face_shape','mature-oval','Mature Oval','Mature Oval','成熟椭圆','mature oval face with poised expression','沉稳的成熟椭圆脸','mature oval face with poised expression','N',100,'{Female,Male,Transgender}',100),
-- Eye color (10)
('eye_color','brown','Brown','Brown','棕色','warm brown eyes','温暖的棕色眼眸','warm brown eyes','N',100,'{Female,Male,Transgender}',10),
('eye_color','black','Black','Black','黑色','deep black eyes','深邃的黑色眼眸','deep black eyes','N',100,'{Female,Male,Transgender}',20),
('eye_color','hazel','Hazel','Hazel','榛果色','hazel eyes with golden flecks','带金点的榛果色眼眸','hazel eyes with golden flecks','N',100,'{Female,Male,Transgender}',30),
('eye_color','amber','Amber','Amber','琥珀','glowing amber eyes','琥珀色的明亮眼眸','glowing amber eyes','R',100,'{Female,Male,Transgender}',40),
('eye_color','blue','Blue','Blue','蓝色','clear ocean blue eyes','清澈的海蓝色眼眸','clear ocean blue eyes','N',100,'{Female,Male,Transgender}',50),
('eye_color','green','Green','Green','绿色','emerald green eyes','翡翠绿的眼眸','emerald green eyes','R',100,'{Female,Male,Transgender}',60),
('eye_color','gray','Gray','Gray','灰色','cool misty gray eyes','清冷的雾灰色眼眸','cool misty gray eyes','R',100,'{Female,Male,Transgender}',70),
('eye_color','violet','Violet','Violet','紫罗兰','captivating violet eyes','迷人的紫罗兰眼眸','captivating violet eyes','SR',50,'{Female,Male,Transgender}',80),
('eye_color','crimson','Crimson','Crimson','绯红','striking crimson eyes','绯红色的眼眸','striking crimson eyes','SR',40,'{Female,Male,Transgender}',90),
('eye_color','heterochromia','Heterochromia','Heterochromia','异瞳','heterochromia eyes, one blue one amber','一蓝一金的异色瞳','heterochromia eyes, one blue one amber','SSR',25,'{Female,Male,Transgender}',100),
-- Height (10)
('height','petite-148','Petite 148cm','Petite 148cm','娇小 148cm','petite stature around 148cm','148cm的娇小身高','petite stature around 148cm','N',100,'{Female,Male,Transgender}',10),
('height','small-153','Small 153cm','Small 153cm','小巧 153cm','small stature around 153cm','153cm的小巧身高','small stature around 153cm','N',100,'{Female,Male,Transgender}',20),
('height','slender-158','Slender 158cm','Slender 158cm','纤细 158cm','slender build around 158cm','158cm的纤细身高','slender build around 158cm','N',100,'{Female,Male,Transgender}',30),
('height','balanced-163','Balanced 163cm','Balanced 163cm','匀称 163cm','balanced height around 163cm','163cm的匀称身高','balanced height around 163cm','N',100,'{Female,Male,Transgender}',40),
('height','graceful-167','Graceful 167cm','Graceful 167cm','修长 167cm','graceful height around 167cm','167cm的修长身高','graceful height around 167cm','N',100,'{Female,Male,Transgender}',50),
('height','tall-172','Tall 172cm','Tall 172cm','高挑 172cm','tall build around 172cm','172cm的高挑身高','tall build around 172cm','N',100,'{Female,Male,Transgender}',60),
('height','statuesque-177','Statuesque 177cm','Statuesque 177cm','颀长 177cm','statuesque height around 177cm','177cm的颀长身高','statuesque height around 177cm','R',100,'{Female,Male,Transgender}',70),
('height','model-182','Model 182cm','Model 182cm','超模 182cm','striking model height around 182cm','182cm的超模身高','striking model height around 182cm','SR',50,'{Female,Male,Transgender}',80),
('height','amazon-187','Amazon 187cm','Amazon 187cm','气场 187cm','commanding height around 187cm','187cm的气场身高','commanding height around 187cm','SR',35,'{Female,Male,Transgender}',90),
('height','towering-192','Towering 192cm','Towering 192cm','压倒 192cm','towering presence around 192cm','192cm的压倒性身高','towering presence around 192cm','SSR',20,'{Female,Male,Transgender}',100)
ON CONFLICT (category, slug) DO UPDATE SET
  value = EXCLUDED.value,
  name_en = EXCLUDED.name_en,
  name_zh = EXCLUDED.name_zh,
  prompt_en = EXCLUDED.prompt_en,
  persona_zh = EXCLUDED.persona_zh,
  persona_en = EXCLUDED.persona_en,
  rarity = EXCLUDED.rarity,
  weight = EXCLUDED.weight,
  genders = EXCLUDED.genders,
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

-- ── girlfriends: store the forged genome + new appearance dimensions ──
ALTER TABLE girlfriends
  ADD COLUMN IF NOT EXISTS appearance_face TEXT,
  ADD COLUMN IF NOT EXISTS appearance_skin TEXT,
  ADD COLUMN IF NOT EXISTS appearance_breast TEXT,
  ADD COLUMN IF NOT EXISTS appearance_height TEXT,
  ADD COLUMN IF NOT EXISTS genome JSONB;

COMMENT ON COLUMN girlfriends.genome IS 'Forged parts combination {category: slug} from character_parts';
COMMENT ON COLUMN girlfriends.appearance_skin IS 'Skin tone part label';
COMMENT ON COLUMN girlfriends.appearance_breast IS 'Bust shape part label';
COMMENT ON COLUMN girlfriends.appearance_height IS 'Height part label';
COMMENT ON COLUMN girlfriends.appearance_face IS 'Face shape part label';

NOTIFY pgrst, 'reload schema';
