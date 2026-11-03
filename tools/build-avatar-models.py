#!/usr/bin/env python3
"""Builds the 3D models for My Avatar from MakeHuman assets, with Blender's Python module and the MPFB add-on.

Run with Blender's Python (bpy 5.x on Python 3.11) after installing MPFB and the CC0 asset packs:
    python tools/build-avatar-models.py            (all models)
    python tools/build-avatar-models.py hair-bob   (only the named assets, plus the body)
    python tools/build-avatar-models.py --body-only (only the body, poses and textures)

What it makes, in apps/my-avatar/models/:
  body.js        the child body with eyes, eyelashes and teeth, MakeHuman's default skeleton, her poses as animations, and
                 morph targets for every face and body slider and for expressions (blinking, smiling)
  <asset>.js     each hair style, eyebrow style and piece of clothing, fitted to the body, rigged to the same
                 skeleton, with the morph targets that change its shape (a wider face moves the hair)
  skin-*.js, eye-*.js   the skin and eye textures she can choose
  catalog.js     what each asset is, which body vertices it hides, and whether its colour can be changed
Each model is a binary glTF, base64-encoded in a plain script (window.AVATAR_MODELS), because the tablet's offline
apps cannot fetch files. Textures are WebP; tintable ones are greyscale so the app can colour them.
The source models are MakeHuman assets from the MakeHuman asset packs; each keeps the license its pack gives it.
"""
import base64, json, math, os, shutil, sys

import bpy, addon_utils
import numpy as np

addon_utils.enable('bl_ext.user_default.mpfb', default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService
from bl_ext.user_default.mpfb.services.targetservice import TargetService
from bl_ext.user_default.mpfb.services.clothesservice import ClothesService
from bl_ext.user_default.mpfb.services.animationservice import AnimationService
from bl_ext.user_default.mpfb.services.assetservice import AssetService
from bl_ext.user_default.mpfb.entities.clothes.mhclo import Mhclo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'apps', 'my-avatar', 'models')
TMP = '/tmp/claude-0/avatar-build'
DATA = os.path.join(bpy.utils.user_resource('EXTENSIONS'), '.user', 'user_default', 'mpfb', 'data')
TARGETS = os.path.join(bpy.utils.user_resource('EXTENSIONS'), 'user_default', 'mpfb', 'data', 'targets')
AGE_YEARS = 8

# ---------------------------------------------------------------------------------------------------------------
# What goes in the app
# ---------------------------------------------------------------------------------------------------------------
# Morph targets on the body: name -> list of (target file, weight). Face and body sliders come in decr/incr pairs.
def pair(name, decr, incr):
    return {name + '-': decr, name + '+': incr}
def lr(t):
    return [('eyes/l-' + t, 1), ('eyes/r-' + t, 1)] if t.startswith('eye') else None
SLIDERS = {}
SLIDERS.update({'shape-round': [('head/head-round', 1)], 'shape-oval': [('head/head-oval', 1)], 'shape-square': [('head/head-square', 1)], 'shape-heart': [('head/head-invertedtriangular', 1)]})
SLIDERS.update(pair('faceWidth', [('head/head-scale-horiz-decr', 1)], [('head/head-scale-horiz-incr', 1)]))
SLIDERS.update(pair('noseWidth', [('nose/nose-scale-horiz-decr', 1)], [('nose/nose-scale-horiz-incr', 1)]))
SLIDERS.update(pair('noseSize', [('nose/nose-volume-decr', 1)], [('nose/nose-volume-incr', 1)]))
SLIDERS.update(pair('noseTip', [('nose/nose-point-down', 1)], [('nose/nose-point-up', 1)]))
SLIDERS.update(pair('lips', [('mouth/mouth-upperlip-volume-decr', 1), ('mouth/mouth-lowerlip-volume-decr', 1)], [('mouth/mouth-upperlip-volume-incr', 1), ('mouth/mouth-lowerlip-volume-incr', 1)]))
SLIDERS.update(pair('mouthWidth', [('mouth/mouth-scale-horiz-decr', 1)], [('mouth/mouth-scale-horiz-incr', 1)]))
SLIDERS.update(pair('chin', [('chin/chin-prominent-decr', 1)], [('chin/chin-prominent-incr', 1)]))
SLIDERS.update(pair('jaw', [('chin/chin-width-decr', 1)], [('chin/chin-width-incr', 1)]))
SLIDERS.update(pair('cheeks', [('cheek/l-cheek-volume-decr', 1), ('cheek/r-cheek-volume-decr', 1)], [('cheek/l-cheek-volume-incr', 1), ('cheek/r-cheek-volume-incr', 1)]))
SLIDERS.update(pair('eyeSize', [('eyes/l-eye-scale-decr', 1), ('eyes/r-eye-scale-decr', 1)], [('eyes/l-eye-scale-incr', 1), ('eyes/r-eye-scale-incr', 1)]))
SLIDERS.update(pair('eyeSpacing', [('eyes/l-eye-trans-in', 1), ('eyes/r-eye-trans-in', 1)], [('eyes/l-eye-trans-out', 1), ('eyes/r-eye-trans-out', 1)]))
SLIDERS.update(pair('ears', [('ears/l-ear-scale-decr', 1), ('ears/r-ear-scale-decr', 1)], [('ears/l-ear-scale-incr', 1), ('ears/r-ear-scale-incr', 1)]))
SLIDERS.update(pair('browHeight', [('eyebrows/eyebrows-trans-down', 1)], [('eyebrows/eyebrows-trans-up', 1)]))
SLIDERS.update({'build-': [('macrodetails/universal-female-child-averagemuscle-minweight', 1), ('macrodetails/universal-female-child-averagemuscle-averageweight', -1)],
                'build+': [('macrodetails/universal-female-child-averagemuscle-maxweight', 1), ('macrodetails/universal-female-child-averagemuscle-averageweight', -1)]})
EXPRESSIONS = ['eyeBlinkLeft', 'eyeBlinkRight', 'mouthSmileLeft', 'mouthSmileRight', 'jawOpen', 'cheekSquintLeft', 'cheekSquintRight',
               'browInnerUp', 'mouthDimpleLeft', 'mouthDimpleRight', 'mouthClose']
# Morphs that change the shape of the head (hair, hats, glasses and eyebrows follow them) or the body (clothes follow).
HEAD_MORPHS = [k for k in SLIDERS if k.split('-')[0].split('+')[0] in ('shape', 'faceWidth', 'ears', 'browHeight', 'eyeSize', 'eyeSpacing')]
BODY_MORPHS = ['build-', 'build+']
POSES = {'stand': 'callharvey3d_standingnatural', 'wave': 'callharvey3d_salute', 'hips': 'drednicolson_arms_akimbo', 'hero': 'elvs_super_him_standing_pose_1',
         'shy': 'callharvey3d_standingmodestembarrassed', 'peace': 'gpedroso_peace_and_love', 'pose': 'sohh_posing2', 'fly': 'fly01'}
SKINS = {'light': 'young_caucasian_female', 'freckles': 'toigo_light_skin_female_freckles', 'medium': 'young_asian_female', 'deep': 'young_african_female'}
EYE_COLORS = ['brownlight', 'green', 'blue', 'lightblue', 'grey', 'bluegreen']
EYE_DERIVED = {'brown': ('brownlight', 0.5), 'darkbrown': ('brownlight', 0.3)}

# Assets: id -> (folder kind, MakeHuman name, label, tint). Tint: the texture becomes greyscale so the app colours it.
ASSETS = {
    # hair
    'hair-long': ('hair', 'long01', 'Long', True), 'hair-straight': ('hair', 'culturalibre_hair_01', 'Long and straight', True),
    'hair-bob': ('hair', 'toigo_blunt_bob', 'Bob', True), 'hair-bob-bangs': ('hair', 'toigo_blunt_bob_with_bangs', 'Bob with bangs', True),
    'hair-curled-bob': ('hair', 'toigo_curled_under_bob', 'Curled bob', True), 'hair-inverted-bob': ('hair', 'toigo_inverted_bob', 'Sleek bob', True),
    'hair-bangs': ('hair', 'cortu_straight_bangs', 'Straight with bangs', True), 'hair-ponytail': ('hair', 'ponytail01', 'Ponytail', True),
    'hair-bun': ('hair', 'rehmanpolanski_hair_bun_brown', 'Bun', True), 'hair-braid-bun': ('hair', 'elvs_reverse_french_braid_bun', 'Braided bun', True),
    'hair-braid': ('hair', 'braid01', 'Braid', True), 'hair-double-braid': ('hair', 'elvs_double_mh_braid', 'Two braids', True),
    'hair-headband': ('hair', 'sonntag78_blond_with_headband', 'Waves with headband', True), 'hair-curls': ('hair', 'cortu_strawberry_cloud_hair', 'Curls', True),
    'hair-wavy-short': ('hair', 'culturalibre_hair_05', 'Short and wavy', True), 'hair-short': ('hair', 'short02', 'Short', True),
    'hair-short-side': ('hair', 'short03', 'Short side part', True), 'hair-afro': ('hair', 'afro01', 'Afro', True),
    # eyebrows
    'brows-natural': ('eyebrows', 'mindfront_eyebrows_01', 'Natural', True), 'brows-soft': ('eyebrows', 'mindfront_eyebrows_05', 'Soft', True),
    'brows-thick': ('eyebrows', 'mindfront_eyebrows_09', 'Thick', True), 'brows-arched': ('eyebrows', 'mindfront_eyebrows_12', 'Arched', True),
    # tops
    'top-tee': ('clothes', 'joepal_crude_t-shirt_female', 'T-shirt', True), 'top-tucked-tee': ('clothes', 'toigo_basic_tucked_t-shirt', 'Tucked tee', True),
    'top-polo': ('clothes', 'namuhekam_male_polo_shirt', 'Polo shirt', True), 'top-sweater': ('clothes', 'toigo_fisherman_sweater', 'Sweater', True),
    'top-tank': ('clothes', 'toigo_camisole_top', 'Tank top', False),
    # bottoms
    'bottom-jean-shorts': ('clothes', 'cortu_jeans_shorts', 'Jean shorts', False), 'bottom-cargo': ('clothes', 'cortu_cargo_pants', 'Cargo pants', True),
    'bottom-pants': ('clothes', 'toigo_wool_pants', 'Pants', True), 'bottom-harem': ('clothes', 'toigo_harem_pants', 'Flowy pants', False),
    'bottom-ruffle-skirt': ('clothes', 'toigo_skirt_with_lace_ruffle', 'Ruffle skirt', False), 'bottom-tiered-skirt': ('clothes', 'toigo_tiered_skirt', 'Tiered skirt', False),
    'bottom-plaid-skirt': ('clothes', 'frankyaye_mini_skirt_02', 'Plaid skirt', False), 'bottom-long-skirt': ('clothes', 'toigo_long_full_skirt', 'Long skirt', False),
    # dresses and whole outfits
    'dress-sundress': ('clothes', 'toigo_camisole_dress_with_full_skirt', 'Sundress', False), 'dress-tiered': ('clothes', 'toigo_dress_with_tiered_skirt', 'Flower dress', False),
    'dress-party': ('clothes', 'toigo_bodice_dress_with_lace_ruffle_skirt', 'Party dress', False), 'dress-tunic': ('clothes', 'wdg_mycenaean_tunic', 'Tunic dress', True),
    'dress-overalls': ('clothes', 'male_worksuit01', 'Overalls', False),
    # shoes and socks
    'shoes-sneakers': ('clothes', 'shoes05', 'Sneakers', True), 'shoes-blue-sneakers': ('clothes', 'shoes06', 'Blue sneakers', False),
    'shoes-leather': ('clothes', 'shoes01', 'Leather shoes', False), 'shoes-mary-janes': ('clothes', 'toigo_mj_cloth_shoes', 'Mary Janes', False),
    'shoes-flats-bows': ('clothes', 'toigo_ballet_flats_with_bows', 'Flats with bows', False), 'shoes-flats-flowers': ('clothes', 'toigo_ballet_flats_with_flowers', 'Flats with flowers', False),
    'shoes-ankle-boots': ('clothes', 'toigo_ankle_boots_male', 'Ankle boots', False), 'shoes-rain-boots': ('clothes', 'culturalibre_hero_boots_2', 'Rain boots', True),
    'socks-low': ('clothes', 'joepal_crude_low_socks', 'Short socks', True), 'socks-high': ('clothes', 'joepal_crude_high_socks', 'Knee socks', True),
    'socks-frill': ('clothes', 'toigo_lace_frill_socks', 'Frilly socks', False), 'socks-warmers': ('clothes', 'toigo_leg_warmer_socks', 'Leg warmers', True),
    # hats, glasses and jewellery
    'hat-newsboy': ('clothes', 'jujube_newsboy_cap', 'Newsboy cap', True), 'hat-santa': ('clothes', 'joepal_xmas_cap', 'Santa hat', False),
    'glasses-black': ('clothes', 'spamrakuen_tbm_glasses_frames_01', 'Black frames', False), 'glasses-round': ('clothes', 'kwnet_at_optical_glasses', 'Round glasses', False),
    'glasses-library': ('clothes', 'frankyaye_glasses_library_male', 'Library glasses', False), 'glasses-leopard': ('clothes', 'toigo_round_glasses_leopard', 'Leopard glasses', False),
    'glasses-3d': ('clothes', 'ews_3d_glasses', '3D glasses', False), 'glasses-goggles': ('clothes', 'culturalibre_doc_ock_glasses', 'Goggles', False),
    'jewel-pearls': ('clothes', 'toigo_pearl_necklace', 'Pearl necklace', False), 'jewel-pearl-earrings': ('clothes', 'toigo_pearl_earrings', 'Pearl earrings', False),
    'jewel-hoops': ('clothes', 'ews_hoop_earrings', 'Hoop earrings', False), 'jewel-lightning': ('clothes', 'culturalibre_heroine_lightning_earrings', 'Lightning earrings', False),
}

# ---------------------------------------------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------------------------------------------
def target_path(rel):
    for ext in ('.target.gz', '.target'):
        p = os.path.join(TARGETS, rel + ext)
        if os.path.exists(p): return p
    p = os.path.join(DATA, 'targets', rel + '.target')
    if os.path.exists(p): return p
    raise IOError('no target ' + rel)

def make_key(obj, name, parts):
    """A shape key holding the sum of several MakeHuman targets (each at its weight)."""
    temp = []
    for rel, w in parts:
        k = TargetService.load_target(obj, target_path(rel), weight=w, name='tmp.' + rel.replace('/', '.'))
        temp.append(k.name)
    key = obj.shape_key_add(name=name, from_mix=True)
    for n in temp: obj.shape_key_remove(obj.data.shape_keys.key_blocks[n])
    key.value = 0.0
    return key

def coords(obj):
    a = np.empty(len(obj.data.vertices) * 3, dtype=np.float32); obj.data.vertices.foreach_get('co', a); return a.reshape(-1, 3)

def morph_asset(asset, base, names):
    """Shape keys on a fitted asset for the given body morphs: refit it with each morph on, keep the difference."""
    if asset.data.shape_keys is None: asset.shape_key_add(name='Basis', from_mix=False)
    rest = coords(asset); made = []
    for n in names:
        base.data.shape_keys.key_blocks[n].value = 1.0
        ClothesService.fit_clothes_to_human(asset, base, set_parent=False)
        moved = coords(asset)
        base.data.shape_keys.key_blocks[n].value = 0.0
        if np.abs(moved - rest).max() < 1e-3: continue      # under a millimetre (at this scale): not worth a morph
        k = asset.shape_key_add(name=n, from_mix=False)
        k.data.foreach_set('co', moved.reshape(-1))
        made.append(n)
    # back to the rest shape (the basis keeps the fitted rest positions)
    asset.data.shape_keys.key_blocks['Basis'].data.foreach_set('co', rest.reshape(-1))
    for v, c in zip(asset.data.vertices, rest): v.co = c
    return made

def tuck_under(asset, base):
    """A shape key 'under' that draws the top of trousers and skirts in against the body, so a shirt worn over them
    covers the waistband instead of the waistband showing through it. Full strength at the top edge, none 8% of her
    height below it."""
    from mathutils.kdtree import KDTree
    bc = coords(base); tree = KDTree(len(bc))
    for i, c in enumerate(bc): tree.insert(c, i)
    tree.balance()
    co = coords(asset); top = co[:, 2].max(); band = 0.08 * (bc[:, 2].max() - bc[:, 2].min())
    out = co.copy()
    for i, c in enumerate(co):
        w = min(1.0, max(0.0, (c[2] - (top - band)) / band)); w = w * w * (3 - 2 * w)
        if w <= 0: continue
        near, _, _ = tree.find(c)
        out[i] = np.array(near) + (c - np.array(near)) * (1 - 0.75 * w)
    if np.abs(out - co).max() < 1e-4: return []
    k = asset.shape_key_add(name='under', from_mix=False); k.data.foreach_set('co', out.reshape(-1))
    return ['under']

def shrink_textures(objs, size):
    for o in objs:
        for slot in o.material_slots:
            if not slot.material or not slot.material.node_tree: continue
            for n in slot.material.node_tree.nodes:
                if n.bl_idname == 'ShaderNodeTexImage' and n.image and max(n.image.size) > size:
                    n.image.scale(size, size)

def greyscale_textures(objs):
    """Colour textures become brightness only (mean about 0.75), so the app can tint them any colour."""
    done = set()
    for o in objs:
        for slot in o.material_slots:
            m = slot.material
            if not m or not m.node_tree: continue
            bsdf = next((n for n in m.node_tree.nodes if n.bl_idname == 'ShaderNodeBsdfPrincipled'), None)
            if not bsdf: continue
            for link in m.node_tree.links:
                if link.to_node == bsdf and link.to_socket.name == 'Base Color':
                    node = link.from_node
                    while node and node.bl_idname != 'ShaderNodeTexImage':
                        node = next((l.from_node for l in m.node_tree.links if l.to_node == node), None)
                    if node and node.image and node.image.name not in done:
                        img = node.image; px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
                        lum = px[:, 0] * 0.2126 + px[:, 1] * 0.7152 + px[:, 2] * 0.0722
                        opaque = px[:, 3] > 0.5
                        mean = lum[opaque].mean() if opaque.any() else lum.mean()
                        lum = np.clip(lum * (0.75 / max(mean, 1e-3)), 0, 1)
                        px[:, 0] = px[:, 1] = px[:, 2] = lum
                        img.pixels[:] = px.reshape(-1); img.update(); done.add(img.name)

def export(objs, path, animations=False):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_apply=False, export_skins=True, export_morph=True,
                              export_morph_normal=False, export_try_sparse_sk=True, export_attributes=True, export_image_format='WEBP',
                              export_image_quality=72, export_animations=animations, export_animation_mode='ACTIONS', export_yup=True,
                              export_def_bones=False, export_optimize_animation_size=True)

def write_js(name, glb):
    data = base64.b64encode(open(glb, 'rb').read()).decode()
    with open(os.path.join(OUT, name + '.js'), 'w') as f:
        f.write('(window.AVATAR_MODELS = window.AVATAR_MODELS || {})[%s] = "%s";\n' % (json.dumps(name), data))
    return os.path.getsize(glb)

def remove_mask_modifiers(o):
    for m in list(o.modifiers):
        if m.type in ('MASK', 'SUBSURF'): o.modifiers.remove(m)

def delete_unused_vertices_for_export(obj, keep_group):
    """A copy of the body without MakeHuman's helper geometry (kept with shape keys, which applying a mask cannot do)."""
    import bmesh
    g = obj.vertex_groups.get(keep_group)
    keep = set()
    for v in obj.data.vertices:
        for ge in v.groups:
            if ge.group == g.index and ge.weight > 0.5: keep.add(v.index)
    bm = bmesh.new(); bm.from_mesh(obj.data)
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if v.index not in keep], context='VERTS')
    bm.to_mesh(obj.data); bm.free()

# ---------------------------------------------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------------------------------------------
def main():
    only = [a for a in sys.argv[1:] if not a.startswith('-')]
    os.makedirs(OUT, exist_ok=True); os.makedirs(TMP, exist_ok=True)
    for o in list(bpy.data.objects): bpy.data.objects.remove(o, do_unlink=True)
    info = HumanService._create_default_human_info_dict()
    info['phenotype'].update({'gender': 0.0, 'age': 0.1875 * (AGE_YEARS - 1) / 10, 'muscle': 0.5, 'weight': 0.5, 'height': 0.5, 'proportions': 0.5,
                              'cupsize': 0.0, 'firmness': 0.5, 'race': {'african': 0.33, 'asian': 0.33, 'caucasian': 0.34}})
    info.update({'eyes': 'high-poly/high-poly.mhclo', 'eyelashes': 'mindfront_eyelashes_02/mindfront_eyelashes_02.mhclo', 'teeth': 'teeth_base/teeth_base.mhclo',
                 'skin_mhmat': SKINS['light'] + '/' + SKINS['light'] + '.mhmat', 'skin_material_type': 'MAKESKIN', 'eyes_material_type': 'MAKESKIN',
                 'alternative_materials': {}, 'proxy': '', 'rig': 'default', 'clothes': []})
    st = HumanService.get_default_deserialization_settings(); st.update({'subdiv_levels': 0, 'override_skin_model': 'MAKESKIN'})
    base = HumanService.deserialize_from_dict(info, st)
    rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
    parts = {o.name.split('.')[-1]: o for o in bpy.data.objects if o.type == 'MESH' and o is not base}
    print('PARTS', list(parts))

    # The age, weight and other body settings become the rest shape; sliders and expressions are added as shape keys.
    TargetService.bake_targets(base)
    base.shape_key_add(name='Basis', from_mix=False)
    for name, ps in SLIDERS.items(): make_key(base, name, ps)
    for e in EXPRESSIONS: make_key(base, e, [('faceunits/' + e, 1)]) if os.path.exists(os.path.join(DATA, 'targets', 'faceunits', e + '.target')) else print('NO FACEUNIT', e)
    body_keys = [k.name for k in base.data.shape_keys.key_blocks if k.name != 'Basis']
    print('BODY KEYS', len(body_keys))

    # Eyes, eyelashes and teeth follow the face sliders and expressions.
    meta = {'body': {'keys': body_keys, 'poses': list(POSES), 'skins': {}, 'eyes': {}}, 'assets': {}}
    for o in parts.values():
        made = morph_asset(o, base, body_keys)
        print('part morphs', o.name, len(made))

    # Poses as one-frame animations.
    # MakeHuman's poses are made for its default skeleton; each is keyed on frame 1 of its own action.
    for pb in rig.pose.bones: pb.rotation_mode = 'XYZ'
    for pid, bvh in POSES.items():
        path = os.path.join(DATA, 'poses', bvh, bvh + '.bvh')
        rig.animation_data_clear()
        for pb in rig.pose.bones: pb.rotation_euler = (0, 0, 0); pb.location = (0, 0, 0)
        had = set(bpy.data.actions)
        AnimationService.import_bvh_file_as_pose(rig, path)
        for extra in [x for x in bpy.data.actions if x not in had]: bpy.data.actions.remove(extra)   # the BVH's own action
        rig.animation_data_create()
        act = bpy.data.actions.new(pid); act.use_fake_user = True; rig.animation_data.action = act
        for pb in rig.pose.bones: pb.keyframe_insert('rotation_euler', frame=1)
        print('POSE', pid, sum(1 for pb in rig.pose.bones if any(abs(x) > 1e-3 for x in pb.rotation_euler)))
    # No action left on the rig (so clothes fit to the rest pose), but animation data stays: the exporter only writes the
    # poses for an armature that has some.
    rig.animation_data.action = None
    for pb in rig.pose.bones: pb.rotation_euler = (0, 0, 0)

    # Skin and eye textures the app can switch between (body texture size 1024). Saved with the Standard view, not
    # Blender's default film look, which would darken them.
    bpy.context.scene.view_settings.view_transform = 'Standard'; bpy.context.scene.view_settings.look = 'None'
    bpy.context.scene.view_settings.exposure = 0; bpy.context.scene.view_settings.gamma = 1
    bpy.context.scene.render.image_settings.file_format = 'WEBP'
    def tex_of(obj):
        for slot in obj.material_slots:
            for n in slot.material.node_tree.nodes:
                if n.bl_idname == 'ShaderNodeTexImage' and n.image: return n.image
    for sid, sk in SKINS.items():
        mhmat = os.path.join(DATA, 'skins', sk, sk + '.mhmat')
        lines = open(mhmat).read().splitlines()
        tex = next((l.split(None, 1)[1] for l in lines if l.startswith('diffuseTexture')), None)
        if not tex: print('NO SKIN TEX', sid); continue
        p = os.path.join(os.path.dirname(mhmat), os.path.basename(tex))
        img = bpy.data.images.load(p); img.scale(1024, 1024); img.filepath_raw = os.path.join(TMP, 'skin-' + sid + '.webp'); img.file_format = 'WEBP'
        bpy.context.scene.render.image_settings.quality = 75; img.save_render(img.filepath_raw)
        px = np.array(img.pixels[:]).reshape(-1, 4)
        meta['body']['skins'][sid] = {'avg': [round(float(x), 4) for x in px[:, :3].mean(0)]}
        write_js('skin-' + sid, img.filepath_raw)
    # MakeHuman's own brown is red-brown, so the browns are made from the light brown, with the iris darkened (the two
    # irises sit in the same place in every MakeHuman eye texture).
    for ec in EYE_COLORS + list(EYE_DERIVED):
        src, dark = EYE_DERIVED.get(ec, (ec, 1.0))
        p = os.path.join(DATA, 'eyes', 'materials', src + '_eye.png')
        if not os.path.exists(p): print('NO EYE', ec); continue
        img = bpy.data.images.load(p); img.scale(512, 512); fp = os.path.join(TMP, 'eye-' + ec + '.webp')
        if dark != 1.0:
            w, h = img.size; px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
            yy, xx = np.mgrid[0:h, 0:w] * (512 / w)
            d = np.minimum(np.hypot(xx - 362, (511 - yy) - 152), np.hypot(xx - 148, (511 - yy) - 362))   # pixels run bottom-up
            k = 1 - (1 - dark) * np.clip((66 - d) / 8, 0, 1)
            px[..., :3] *= k[..., None]; img.pixels[:] = px.reshape(-1); img.update()
        img.save_render(fp)
        meta['body']['eyes'][ec] = True
        write_js('eye-' + ec, fp)

    # Assets.
    wanted = [] if '--body-only' in sys.argv else [a for a in ASSETS if not only or a in only]
    if only or '--body-only' in sys.argv:          # a partial build keeps what the last build made for the other assets
        try:
            old = open(os.path.join(OUT, 'catalog.js')).read(); old = json.loads(old[old.index('=') + 1:].strip().rstrip(';'))
            meta['assets'] = {k: v for k, v in old['assets'].items() if k not in wanted}
        except (IOError, ValueError): pass
    for aid in wanted:
        kind, name, label, tint = ASSETS[aid]
        folder = os.path.join(DATA, kind, name)
        mh = next((f for f in os.listdir(folder) if f.endswith('.mhclo')), None)
        before = set(bpy.data.objects)
        obj = HumanService.add_mhclo_asset(os.path.join(folder, mh), base, asset_type=kind, subdiv_levels=0, material_type='MAKESKIN', alternative_materials={})
        new = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
        mhclo = Mhclo(); mhclo.load(os.path.join(folder, mh))
        hides = sorted(set(int(v) for v in (getattr(mhclo, 'delverts', None) or [])))
        follow = HEAD_MORPHS + EXPRESSIONS if kind in ('hair', 'eyebrows') or aid.startswith(('hat-', 'glasses-', 'jewel-')) else BODY_MORPHS
        made = []
        for o in new:
            remove_mask_modifiers(o)
            made = morph_asset(o, base, [k for k in follow if k in body_keys])
            if aid.startswith('bottom-'): made += tuck_under(o, base)
        shrink_textures(new, 1024 if kind == 'hair' else 512)
        if tint: greyscale_textures(new)
        glb = os.path.join(TMP, aid + '.glb'); export([rig] + new, glb)
        size = write_js(aid, glb)
        meta['assets'][aid] = {'kind': kind, 'label': label, 'tint': tint, 'hides': hides, 'morphs': made, 'bytes': size}
        print('ASSET', aid, size, len(hides), made)
        for o in new: bpy.data.objects.remove(o, do_unlink=True)
        # Adding clothes put a hide-under-clothes mask on the body; take it off for the next asset.
        remove_mask_modifiers(base)
        if 'Delete' in base.vertex_groups: base.vertex_groups.remove(base.vertex_groups['Delete'])

    # The body itself: a copy without helper geometry, with each vertex's MakeHuman number so clothes can hide what is under them.
    vid = base.data.attributes.new('_vid', 'FLOAT', 'POINT')
    vid.data.foreach_set('value', np.arange(len(base.data.vertices), dtype=np.float32))
    body = base.copy(); body.data = base.data.copy(); bpy.context.collection.objects.link(body); body.name = 'Body'
    remove_mask_modifiers(body)
    delete_unused_vertices_for_export(body, 'body')
    shrink_textures([body] + list(parts.values()), 1024)
    glb = os.path.join(TMP, 'body.glb')
    export([rig, body] + list(parts.values()), glb, animations=True)
    meta['body']['bytes'] = write_js('body', glb)
    meta['body']['height'] = round(max((body.matrix_world @ v.co).z for v in body.data.vertices), 4)
    with open(os.path.join(OUT, 'catalog.js'), 'w') as f:
        f.write('window.AVATAR_CATALOG = ' + json.dumps(meta) + ';\n')
    print('BODY', meta['body']['bytes'], 'TOTAL', sum(os.path.getsize(os.path.join(OUT, f)) for f in os.listdir(OUT)))

main()
