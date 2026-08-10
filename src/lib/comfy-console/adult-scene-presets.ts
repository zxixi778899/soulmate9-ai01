import type { NsfwIntensity } from '@/lib/comfy-console/studio-profile';
import type { ImageModelFamily } from '@/lib/image-generation-routing';

export type AdultScenePreset = {
  id: string;
  level: 1 | 2 | 3 | 4 | 5;
  label: string;
  scene: string;
};

const LEVEL_1_SCENES = [
  ['coffee-date', '咖啡约会', 'sitting together at a cozy café table, natural daylight, relaxed body language, stylish everyday outfit, soft smile, warm intimate café atmosphere, bright natural window light'],
  ['park-stroll', '公园散步', 'walking side by side on a sunlit park path, casual clothing, playful glance, trees and greenery in background, golden afternoon light, gentle breeze in hair'],
  ['shopping-together', '逛街购物', 'browsing clothing racks in a boutique, standing close, casual chic outfit, soft store lighting, warm neutral tones, relaxed candid interaction'],
  ['sunset-rooftop', '日落天台', 'standing on a rooftop terrace at golden hour, warm sunset light, flowing dress or casual shirt, city skyline behind, intimate romantic atmosphere, soft warm backlight'],
  ['bookstore-meet', '书店相遇', 'leaning against a bookshelf in a quiet bookstore, warm reading lamp light, intellectual curiosity, casual stylish outfit, cozy warm atmosphere, soft focused lighting'],
  ['beach-walk', '海滩漫步', 'walking barefoot along the shoreline at sunset, casual beachwear, waves gently touching feet, warm golden light, relaxed intimate mood, natural ocean breeze movement'],
  ['wine-bar', '红酒酒吧', 'sitting at a dimly lit wine bar, two glasses on the table, elegant evening outfit, candlelight glow, intimate romantic mood, warm amber lighting'],
  ['picnic-park', '野餐时光', 'sitting on a picnic blanket in a sunny park, casual comfortable outfit, fresh fruit and snacks, soft dappled sunlight through leaves, relaxed playful energy'],
  ['art-gallery', '画廊漫步', 'walking through a modern art gallery, sophisticated outfit, soft gallery lighting, cultured atmosphere, contemplative mood, clean neutral background'],
  ['home-cooking', '一起做饭', 'cooking together in a bright home kitchen, casual apron over outfit, natural morning light, cozy domestic atmosphere, playful interaction, warm natural lighting'],
  ['night-market', '夜市小吃', 'walking through a lively night market, colorful street food stalls, casual fun outfit, warm neon and string lights, energetic urban atmosphere, candid street photography lighting'],
  ['poolside-lounge', '泳池边', 'lounging by a private pool, stylish swimwear or summer outfit, tropical plants, bright afternoon sunlight, relaxed vacation mood, clean blue water reflections'],
  ['live-music', '现场音乐', 'standing at a small live music venue, casual cool outfit, stage lights creating colorful atmosphere, dancing or swaying, intimate concert setting, dynamic stage lighting'],
  ['morning-coffee', '早晨咖啡', 'holding a coffee cup on a balcony in the morning, cozy robe or casual loungewear, sleepy relaxed expression, soft morning light, peaceful quiet atmosphere'],
  ['bike-ride', '骑车出游', 'riding bicycles through a scenic countryside path, sporty casual outfit, windblown hair, bright sunny day, carefree joyful mood, natural outdoor lighting'],
  ['movie-night', '电影之夜', 'curled up on a sofa together watching a movie, cozy casual clothes, soft TV glow, blankets and pillows, warm intimate domestic atmosphere, dim ambient light'],
  ['farmers-market', '农贸市场', 'browsing fresh produce at a farmers market, casual weekend outfit, natural morning light, colorful fruit and vegetables, cheerful community atmosphere, bright outdoor lighting'],
  ['boardwalk-evening', '海滨栈道', 'walking along a boardwalk at dusk, casual evening outfit, string lights above, ocean breeze, relaxed romantic mood, soft twilight blue hour lighting'],
  ['yoga-together', '一起瑜伽', 'doing yoga poses together in a bright studio, matching activewear, morning sunlight streaming through windows, peaceful focused mood, clean balanced lighting'],
  ['brunch-date', '早午餐约会', 'sharing brunch at a sunny sidewalk café, stylish casual weekend outfit, fresh juice and pastries, bright morning light, cheerful relaxed mood, warm natural sunlight'],
  ['flower-field', '花田漫步', 'walking through a field of wildflowers, flowing summer dress, golden hour light, butterflies and petals, dreamy romantic atmosphere, warm soft backlight'],
  ['rooftop-pool', '屋顶泳池', 'lounging by a rooftop infinity pool, stylish swimwear, city skyline panorama, bright midday sun with umbrellas, luxurious vacation mood, clear blue water reflections'],
  ['jazz-bar', '爵士酒吧', 'sitting at a cozy jazz bar, elegant evening attire, dim warm lighting, live band on stage, sophisticated intimate mood, amber and blue mood lighting'],
  ['snowy-walk', '雪中漫步', 'walking hand in hand through gentle snowfall, warm winter coat and scarf, soft white snow on trees, cozy cold weather atmosphere, soft overcast winter light'],
  ['sunset-boat', '日落泛舟', 'sitting together in a small boat on a calm lake at sunset, casual summer outfit, golden reflections on water, peaceful romantic mood, warm golden hour light'],
  ['library-date', '图书馆约会', 'sitting at a quiet study table in a grand library, casual smart outfit, warm desk lamp light, intellectual atmosphere, intimate quiet space, warm focused lighting'],
  ['garden-tea', '花园下午茶', 'having afternoon tea in a blooming garden, elegant casual dress, floral surroundings, soft afternoon light, refined relaxed atmosphere, warm natural daylight'],
  ['city-rooftop', '城市天台', 'standing on a high rooftop overlooking the city at night, stylish evening outfit, city lights below, cool night breeze, sophisticated urban mood, city light ambiance'],
  ['beach-sunset', '海滩日落', 'sitting on the sand watching the sunset, arms wrapped around knees, casual beachwear, warm golden and pink sky, peaceful romantic mood, soft warm sunset light'],
  ['fireplace-evening', '壁炉之夜', 'sitting by a crackling fireplace, cozy sweater or blanket, warm fire glow, intimate cabin atmosphere, relaxed quiet evening, warm flickering firelight'],
] as const;

const LEVEL_2_SCENES = [
  ['lingerie-mirror', '内衣镜前', 'standing in front of a full-length mirror wearing elegant lace lingerie, soft bedroom lighting, one hand adjusting a strap, confident seductive gaze, warm intimate atmosphere, flattering soft light'],
  ['sheer-robe', '薄纱睡袍', 'wearing a sheer silk robe slightly open at the chest, standing by a window, soft morning light filtering through, sensual relaxed pose, elegant boudoir atmosphere, soft diffused window light'],
  ['bed-lingerie', '床上内衣', 'reclining on a bed in matching lace lingerie set, propped on pillows, one leg slightly bent, direct eye contact, warm intimate bedroom lighting, soft sensual mood'],
  ['stockings-chair', '丝袜椅上', 'seated on a velvet chair wearing stockings and a garter belt with a lace top, legs crossed slowly, dramatic soft key light, sophisticated boudoir photography, elegant sensual lighting'],
  ['satin-nightie', '缎面睡衣', 'wearing a short satin nightie standing by the bed, fabric catching the light, soft romantic evening glow, gentle seductive smile, warm intimate atmosphere, soft backlight creating silhouette edge'],
  ['bodysuit-pose', '连体衣展示', 'wearing a delicate lace bodysuit, standing in three-quarter view, one hand on hip, confident sultry expression, boudoir studio lighting, soft key light with subtle rim'],
  ['open-shirt', '敞开的衬衫', 'wearing a man\'s dress shirt partially unbuttoned, sitting on the edge of a bed, long legs visible, casual seductive pose, soft morning light, intimate relaxed atmosphere'],
  ['corset-back', '束腰背面', 'wearing a satin corset with visible lacing at the back, standing in profile, hands reaching back to adjust, elegant boudoir setting, warm dramatic side lighting'],
  ['babydoll-stand', '娃娃裙站立', 'wearing a sheer babydoll chemise, standing naturally, thigh-length hem, soft fabric movement, warm romantic lighting, playful sensual mood, flattering soft focus background'],
  ['thong-bend', '丁字裤弯腰', 'wearing only a thong and a loose open shirt, bending forward slightly to pick something up, playful rear view, soft bedroom lighting, casual intimate boudoir moment'],
  ['lace-bralette', '蕾丝bralette', 'wearing a lace bralette and high-waisted underwear, leaning against a dresser, morning light, confident body language, natural sensual energy, warm soft fill light'],
  ['silk-wrap', '丝绸缠绕', 'wearing a silk wrap dress loosely tied, sitting on a sofa, one shoulder exposed, relaxed elegant pose, soft afternoon light, sophisticated intimate atmosphere'],
  ['fishnet-tease', '渔网挑逗', 'wearing fishnet stockings with a lace top, sitting on a bed edge, legs extended, playful teasing expression, dim warm lamp light, sensual boudoir mood, soft dramatic lighting'],
  ['towel-wrap', '浴巾包裹', 'wearing only a towel wrapped high, fresh from a shower, damp hair, standing in bathroom doorway, soft steam and warm light, natural sensual freshness, bright clean bathroom lighting'],
  ['garter-belt', '吊袜带展示', 'wearing a garter belt and stockings with a sheer bra, standing in three-quarter view, elegant boudoir pose, soft dramatic key light, sophisticated erotic photography, warm balanced studio lighting'],
  ['negligee-recline', '睡衣斜倚', 'reclining on a chaise lounge in a sheer negligee, one arm above head, elegant elongated silhouette, soft romantic light, classic boudoir composition, warm golden lighting'],
  ['bra-panty-set', '内衣套装', 'wearing a matching bra and panty set, standing in a walk-in closet, reaching for something on a high shelf, body stretched elegantly, natural soft lighting, candid intimate moment'],
  ['silk-robe-floor', '丝袍落地', 'silk robe pooled on the floor around feet, standing nude from waist up, arms crossed or covering breasts, soft morning window light, tasteful artistic boudoir, elegant natural lighting'],
  ['chemise-morning', '晨间睡衣', 'wearing a short chemise in the morning, making coffee in the kitchen, casual domestic setting, soft natural daylight, intimate everyday sensuality, warm morning sun'],
  ['balcony-lingerie', '阳台内衣', 'standing on a private balcony in lingerie, sunrise or sunset light, city or garden view, confident sensual pose, warm golden outdoor light, luxurious intimate atmosphere'],
  ['lace-gloves', '蕾丝手套', 'wearing long lace gloves with a matching lingerie set, seated at a vanity, elegant vintage boudoir style, dramatic soft lighting, sophisticated sensual mood, warm amber and rose tones'],
  ['suspender-belt', '吊带袜束腰', 'wearing a suspender belt with thigh-high stockings and a lace bra, standing in profile, hands on hips, confident sensual stance, studio boudoir lighting, soft key with rim light'],
  ['mesh-bodysuit', '网眼连体衣', 'wearing a sheer mesh bodysuit, standing in a doorway, dim ambient light creating silhouette, mysterious seductive mood, low-key dramatic lighting, soft edge light defining curves'],
  ['satin-gloves', '缎面手套', 'wearing long satin gloves with a matching bra and panty set, seated on a velvet ottoman, elegant sophisticated pose, soft warm studio lighting, vintage boudoir atmosphere'],
  ['open-back-dress', '露背裙', 'wearing a dress with a deep open back, standing facing away looking over shoulder, elegant back curves visible, soft evening light, sophisticated sensual mood, warm golden rim light'],
  ['crotchless-panty', '开裆内衣', 'wearing a crotchless panty with a lace top, sitting on a bed with legs slightly apart, explicit underwear style, direct confident gaze, warm intimate bedroom lighting, soft sensual atmosphere'],
  ['sheer-bodysuit', '透视连体衣', 'wearing a completely sheer bodysuit, standing full-length, body clearly visible through fabric, tasteful artistic presentation, soft diffused studio lighting, elegant boudoir photography'],
  ['pasties-only', '乳贴only', 'wearing only pasties and a thong, standing confident full-frontal lingerie pose, tasteful erotic presentation, soft warm studio lighting, artistic boudoir composition'],
  ['open-robe-bench', '开袍长凳', 'sitting on a padded bench wearing an open robe, legs crossed, one hand resting on thigh, soft dramatic side lighting, intimate boudoir atmosphere, elegant sensual pose'],
  ['candlelight-lingerie', '烛光内衣', 'wearing lingerie by candlelight, warm flickering glow on skin, lying on a bed, soft intimate atmosphere, romantic sensual mood, warm candle flame lighting only'],
] as const;

const LEVEL_3_SCENES = [
  ['window-light-standing', '窗边站姿', 'standing nude beside a tall window, relaxed weight shift, direct gaze, tasteful nonsexual presentation, bright diffused daylight'],
  ['studio-seated', '影棚坐姿', 'seated nude on a low studio cube, knees angled naturally, hands relaxed away from intimate areas, seamless warm-gray backdrop'],
  ['bathroom-mirror', '浴室镜前', 'nude beside a clean bathroom mirror after a shower, damp hair, relaxed posture, bright flattering vanity light'],
  ['bedside-morning', '卧室晨光', 'nude at the edge of a neatly made bed, natural waking stretch, soft morning sunlight and balanced fill'],
  ['balcony-back-view', '阳台背影', 'nude three-quarter back view on a private balcony, looking over one shoulder, golden-hour rim light'],
  ['fine-art-recline', '艺术侧卧', 'fine-art nude reclining sideways on linen, elegant extended silhouette, nonsexual pose, soft directional studio light'],
  ['shower-profile', '淋浴侧影', 'nude profile beneath a modern shower, water droplets visible, calm expression, bright clean overhead and frontal fill'],
  ['vanity-preparation', '梳妆台前', 'nude seated at a vanity while arranging her hair, composed expression, warm practical bulbs with soft frontal fill'],
  ['curtain-silhouette', '纱帘轮廓', 'nude body framed by sheer curtains, readable anatomy rather than silhouette, bright backlight balanced by frontal fill'],
  ['poolside-dryoff', '泳池擦身', 'nude drying off beside a private pool, towel held at one side, natural standing posture, clear afternoon sunlight'],
  ['loft-stretch', '阁楼伸展', 'nude full-body stretch in a bright loft, arms raised, balanced stance, large softbox-quality window light'],
  ['sofa-candid', '沙发随拍', 'nude relaxed on a modern sofa, candid seated posture, no sexual action, bright editorial living-room lighting'],
  ['dressing-room', '更衣室', 'nude between outfits in a private dressing room, one hand holding a garment, neutral natural pose, clear mirror lighting'],
  ['white-sheet-wrap', '白床单', 'nude with a white sheet loosely gathered at the hips, upper body visible, serene expression, high-key soft lighting'],
  ['floor-seated', '地毯坐姿', 'nude seated naturally on a textured rug, upright posture and separated limbs, bright side key with gentle fill'],
  ['garden-private', '私家庭院', 'nude standing in a secluded garden, relaxed arms, nonsexual fine-art presentation, sunlit foliage and clean skin tones'],
  ['tub-edge', '浴缸边缘', 'nude seated on the edge of a freestanding bathtub, feet on the floor, composed posture, bright spa lighting'],
  ['robe-opening', '浴袍滑落', 'adult nude as an open robe slips from the shoulders, still standing naturally, fashion-editorial framing and soft key light'],
  ['staircase-pose', '楼梯站姿', 'nude posed naturally on a private interior staircase, full body visible, architectural composition, bright controlled lighting'],
  ['backdrop-turn', '转身回眸', 'nude mid-turn against a neutral photographic backdrop, clear full-body anatomy, confident gaze, even studio exposure'],
  ['yoga-nude', '裸体瑜伽', 'nude in a gentle yoga stretch on a mat, full body visible, natural morning light, serene nonsexual atmosphere, clean bright studio lighting'],
  ['reading-nude', '裸体阅读', 'nude curled up on a sofa reading a book, natural relaxed pose, soft afternoon light, intellectual calm atmosphere, warm comfortable lighting'],
  ['window-silhouette', '窗边剪影', 'nude standing in profile before a large window, body outlined by bright daylight, artistic silhouette composition, tasteful nonsexual presentation'],
  ['plant-corner', '绿植角落', 'nude standing among indoor plants, natural tropical atmosphere, soft diffused light through leaves, artistic botanical composition, warm green tones'],
  ['artist-model', '画家模特', 'nude posing as an artist model on a small platform, classical standing pose, studio skylight above, professional nonsexual atmosphere, bright north-facing light'],
  ['sunbeam-nap', '阳光午睡', 'nude napping on a bed in a warm sunbeam, natural relaxed fetal position, peaceful expression, soft golden light, serene nonsexual atmosphere'],
  ['balcony-morning', '阳台清晨', 'nude stepping onto a private balcony at dawn, first morning light, relaxed standing posture, fresh air feeling, soft cool morning light with warm fill'],
  ['library-nude', '图书馆裸体', 'nude browsing books in a private library, intellectual atmosphere, natural standing pose, warm desk lamp light, artistic nonsexual presentation'],
  ['piano-nude', '钢琴裸体', 'nude seated at a grand piano, fingers on keys, classical elegant pose, soft concert lighting, artistic sophisticated atmosphere, warm directional light'],
  ['sketching-nude', '素描裸体', 'nude seated on a stool being sketched by an unseen artist, classical academic pose, even studio lighting, artistic nonsexual atmosphere, clean bright light'],
] as const;

const LEVEL_4_SCENES = [
  ['bed-solo', '床上独处', 'explicit adult solo masturbation on a bed before climax, clear purposeful hand placement, readable anatomy, bright soft bedroom light'],
  ['sofa-solo', '沙发独处', 'explicit adult solo masturbation seated on a sofa before climax, legs positioned clearly, coherent hands, warm balanced practical light'],
  ['mirror-solo', '镜前独处', 'explicit adult solo masturbation before a full-length mirror, reflection and primary body aligned, clear action, bright vanity lighting'],
  ['shower-solo', '淋浴独处', 'explicit adult solo masturbation beneath a shower before climax, stable standing support, visible water detail, clean bright bathroom light'],
  ['chair-solo', '椅上独处', 'explicit adult solo masturbation on a sturdy chair before climax, readable seated anatomy, direct gaze, controlled studio illumination'],
  ['floor-solo', '地毯独处', 'explicit adult solo masturbation seated on a soft rug before climax, balanced pose, unobstructed anatomy, bright side key and fill'],
  ['window-solo', '窗边独处', 'explicit adult solo masturbation beside a private window before climax, supported standing pose, clear hands, diffused daylight and fill'],
  ['tub-solo', '浴缸独处', 'explicit adult solo masturbation in a freestanding bathtub before climax, upper body supported, clear action, luminous spa lighting'],
  ['vanity-solo', '梳妆台独处', 'explicit adult solo masturbation seated at a vanity before climax, mirror composition remains coherent, bright flattering bulbs'],
  ['kneeling-solo', '跪姿独处', 'explicit adult solo masturbation in a stable kneeling pose before climax, anatomically coherent hands and hips, clean studio backdrop'],
  ['reclining-solo', '侧卧独处', 'explicit adult solo masturbation while reclining sideways before climax, readable hand contact, elegant diagonal composition, soft bright key light'],
  ['upright-bed-solo', '床头坐姿', 'explicit adult solo masturbation sitting upright against pillows before climax, clear anatomy and hands, bright morning bedroom light'],
  ['private-balcony-solo', '私密阳台', 'explicit adult solo masturbation on a secluded balcony before climax, stable seated pose, warm sunset key with frontal fill'],
  ['dressing-room-solo', '更衣室独处', 'explicit adult solo masturbation in a private dressing room before climax, clothing nearby, coherent mirror perspective and bright fill'],
  ['high-key-solo', '高调影棚', 'explicit adult solo masturbation in a high-key studio before climax, full-body composition, precise anatomy, even shadowless exposure'],
  ['low-bed-solo', '床沿独处', 'explicit adult solo masturbation at the edge of a low bed before climax, grounded feet and readable posture, bright cinematic side light'],
  ['arched-recline-solo', '仰卧独处', 'explicit adult solo masturbation reclining on her back before climax, natural body arch, clear hand action, balanced overhead and frontal light'],
  ['cushion-solo', '靠垫独处', 'explicit adult solo masturbation among large cushions before climax, body fully readable, purposeful expression, soft diffused light'],
  ['night-lamp-solo', '夜灯独处', 'explicit adult solo masturbation before climax in a private bedroom at night, warm lamp motivated key plus sufficient frontal fill'],
  ['editorial-solo', '杂志构图', 'explicit adult solo masturbation before climax photographed as a polished adult editorial, unambiguous action, accurate anatomy, bright professional lighting'],
  ['bathtub-edge-solo', '浴缸沿独处', 'explicit adult solo masturbation seated on the edge of a bathtub before climax, feet in water, clear hand placement, warm spa lighting, bright clean reflection'],
  ['standing-mirror-solo', '立镜独处', 'explicit adult solo masturbation standing before a full-length mirror before climax, both reflection and body visible, clear hand action, bright vanity lighting'],
  ['desk-solo', '书桌独处', 'explicit adult solo masturbation leaning back against a desk before climax, standing supported pose, clear hand position, warm desk lamp light, intimate study atmosphere'],
  ['poolside-solo', '池边独处', 'explicit adult solo masturbation on a pool lounger before climax, reclined pose, clear hand placement, warm afternoon sun, private resort atmosphere'],
  ['staircase-solo', '楼梯独处', 'explicit adult solo masturbation seated on a staircase landing before climax, legs open, clear hand action, soft architectural lighting, private intimate setting'],
  ['yoga-mat-solo', '瑜伽垫独处', 'explicit adult solo masturbation on a yoga mat before climax, kneeling pose, clear anatomy, soft morning light, serene but explicit atmosphere'],
  ['window-ledge-solo', '窗台独处', 'explicit adult solo masturbation perched on a wide window ledge before climax, legs open, clear hand placement, soft diffused daylight, private urban view'],
  ['armchair-solo', '扶手椅独处', 'explicit adult solo masturbation in a deep armchair before climax, legs over one arm, clear hand action, warm lamp light, cozy intimate setting'],
  ['shower-bench-solo', '淋浴凳独处', 'explicit adult solo masturbation seated on a shower bench before climax, water streaming, clear hand placement, bright bathroom light, steamy atmosphere'],
  ['couch-edge-solo', '沙发沿独处', 'explicit adult solo masturbation at the edge of a leather couch before climax, feet on floor, leaning back, clear hand action, warm living room light, comfortable intimate mood'],
] as const;

const LEVEL_5_SCENES = [
  ['bed-face-to-face', '床上相拥', 'explicit consensual sex between unmistakably adult partners on a bed, face-to-face position, coherent contact and anatomy, bright soft bedroom light'],
  ['bed-rear-entry', '床上后入', 'explicit consensual rear-entry sex between unmistakably adult partners on a bed, readable full-body alignment, coherent contact, bright side key and fill'],
  ['sofa-couple', '沙发情侣', 'explicit consensual sex between unmistakably adult partners on a sofa, stable supported pose, distinct limbs and faces, warm balanced room light'],
  ['standing-couple', '站立情侣', 'explicit consensual standing sex between unmistakably adult partners, supported balance and clear physical alignment, bright studio-quality light'],
  ['cowgirl-couple', '女上位', 'explicit consensual woman-on-top sex between unmistakably adult partners, readable centered composition, coherent hips and hands, soft frontal light'],
  ['reverse-couple', '反向骑乘', 'explicit consensual reverse riding position between unmistakably adult partners, clear body separation and contact, bright controlled bedroom lighting'],
  ['side-by-side-couple', '侧卧情侣', 'explicit consensual side-lying sex between unmistakably adult partners, intertwined bodies remain readable, gentle bright window light'],
  ['chair-couple', '椅上情侣', 'explicit consensual sex between unmistakably adult partners using a sturdy chair, supported seated pose, coherent anatomy, clear studio exposure'],
  ['shower-couple', '淋浴情侣', 'explicit consensual sex between unmistakably adult partners in a shower, stable wall support, readable anatomy, bright clean bathroom lighting'],
  ['counter-couple', '台边情侣', 'explicit consensual sex between unmistakably adult partners at a sturdy counter, supported body placement, clear contact, bright practical and fill light'],
  ['floor-couple', '地毯情侣', 'explicit consensual sex between unmistakably adult partners on a rug, balanced pose and distinct limbs, soft bright side lighting'],
  ['window-couple', '窗边情侣', 'explicit consensual sex between unmistakably adult partners beside a private window, readable silhouettes with strong frontal fill and correct exposure'],
  ['hotel-couple', '酒店情侣', 'explicit consensual sex between unmistakably adult partners in an upscale hotel room, coherent intimate pose, bright premium editorial lighting'],
  ['studio-couple', '影棚情侣', 'explicit consensual sex between unmistakably adult partners against a seamless studio backdrop, anatomically precise contact, even high-key exposure'],
  ['kneeling-couple', '跪姿情侣', 'explicit consensual sex between unmistakably adult partners in a supported kneeling position, clear hands, faces and body alignment, bright softbox light'],
  ['edge-of-bed-couple', '床沿情侣', 'explicit consensual sex between unmistakably adult partners at the edge of a bed, grounded supported posture, clear anatomy, warm key and frontal fill'],
  ['embrace-couple', '亲密拥抱', 'explicit consensual sex between unmistakably adult partners in a close embrace, both adult faces visible, coherent contact, flattering bright light'],
  ['private-loft-couple', '阁楼情侣', 'explicit consensual sex between unmistakably adult partners in a private loft, full-body editorial composition, bright window light and balanced fill'],
  ['climax-couple', '高潮时刻', 'explicit consensual sex between unmistakably adult partners through climax, requested sexual fluids visible, coherent anatomy, bright professional exposure'],
  ['afterglow-couple', '高潮余韵', 'explicit consensual adult couple immediately after climax with visible sexual fluids, intertwined bodies still anatomically readable, soft bright afterglow lighting'],
  ['missionary-couple', '传教士式', 'explicit consensual missionary position sex between unmistakably adult partners on a bed, face-to-face, legs intertwined, clear full-body contact, warm soft bedroom lighting'],
  ['doggy-couple', '后入式', 'explicit consensual doggy style sex between unmistakably adult partners on a bed, both on knees, clear penetration and anatomy, bright side key and rim light'],
  ['spooning-couple', '汤匙式', 'explicit consensual spooning sex between unmistakably adult partners lying on their sides, rear entry, bodies pressed together, soft warm bedroom light, intimate cozy atmosphere'],
  ['sixty-nine-couple', '69式', 'explicit consensual mutual oral sex between unmistakably adult partners in 69 position, both faces and genitals visible, coherent anatomy, soft warm lighting, balanced exposure'],
  ['lap-dance-couple', '膝上情侣', 'explicit consensual sex between unmistakably adult partners with one partner straddling the other\'s lap, face-to-face, clear contact and anatomy, warm intimate lamp light'],
  ['bent-over-couple', '弯腰情侣', 'explicit consensual sex between unmistakably adult partners with one partner bent over a surface, rear entry, clear full-body alignment, bright studio lighting, readable anatomy'],
  ['threesome-fff', '三女', 'explicit consensual threesome between three unmistakably adult female partners, coherent group composition, distinct bodies and clear contact, bright soft studio lighting'],
  ['threesome-mff', '一男二女', 'explicit consensual threesome between one unmistakably adult male and two unmistakably adult female partners, coherent group composition, distinct bodies, bright balanced lighting'],
  ['group-four', '四人组', 'explicit consensual group sex between four unmistakably adult partners, coherent composition, distinct bodies and clear interactions, bright studio lighting, readable anatomy'],
  ['oral-standing', '站立口交', 'explicit consensual oral sex between unmistakably adult partners, one kneeling before the other standing, clear oral contact, readable anatomy, warm studio lighting, coherent composition'],
] as const;

function toPresets(level: 1 | 2 | 3 | 4 | 5, rows: readonly (readonly [string, string, string])[]): AdultScenePreset[] {
  return rows.map(([id, label, scene]) => ({ id: `nsfw-${level}-${id}`, level, label, scene }));
}

export const ADULT_SCENE_PRESETS: Record<1 | 2 | 3 | 4 | 5, AdultScenePreset[]> = {
  1: toPresets(1, LEVEL_1_SCENES),
  2: toPresets(2, LEVEL_2_SCENES),
  3: toPresets(3, LEVEL_3_SCENES),
  4: toPresets(4, LEVEL_4_SCENES),
  5: toPresets(5, LEVEL_5_SCENES),
};

export function selectAdultScenePreset(
  intensity: NsfwIntensity,
  random: () => number = Math.random,
): AdultScenePreset | null {
  const level = intensity as 1 | 2 | 3 | 4 | 5;
  const presets = ADULT_SCENE_PRESETS[level];
  if (!presets || presets.length === 0) return null;
  const index = Math.min(presets.length - 1, Math.max(0, Math.floor(random() * presets.length)));
  return presets[index];
}

export function adultModelPromptSuffix(modelFamily: ImageModelFamily): string {
  if (modelFamily === 'pony') {
    return 'score_9, score_8_up, score_7_up, source_photo, anatomically coherent adult bodies, distinct limbs and hands, correct physical contact, realistic skin texture';
  }
  if (modelFamily === 'illustrious') {
    return 'masterpiece, best quality, absurdres, coherent adult anatomy, readable silhouettes, clean linework, polished shading';
  }
  return 'FLUX natural-language composition, anatomically coherent adult bodies, correct physical relationships, natural skin texture, professional photography';
}
